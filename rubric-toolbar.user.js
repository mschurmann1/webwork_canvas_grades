// ==UserScript==
// @name         Rubric Toolbar - Full Credit, Zero Credit, Export
// @namespace    https://github.com/UCBoulder
// @description  Unified toolbar with Full Credit, Zero Credit, and Export Rubric Scores buttons for SpeedGrader
// @match        https://*/courses/*/gradebook/speed_grader*
// @grant        none
// @run-at       document-idle
// @version      1.0.0
// ==/UserScript==

(function() {
    'use strict';

    console.log('[RubricToolbar] Script started on:', window.location.href);

    function getStudentId() {
        var fromSelect = document.querySelector('#students_selectmenu option:checked');
        if (fromSelect && fromSelect.value) return fromSelect.value;
        var m = window.location.search.match(/student_id=([0-9]+)/);
        if (m) return m[1];
        return null;
    }

    function getCsrfToken() {
        var match = document.cookie.match(/(_csrf_token|csrfToken)=([^;]+)/);
        return match ? decodeURIComponent(match[2]) : '';
    }

    function csvEncode(s) {
        s = String(s == null ? '' : s);
        if (s.includes('"') || s.includes(',') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
        return s;
    }

    function getAllPages(url, callback) {
        var results = [];
        function getPage(u) {
            fetch(u).then(function(r) {
                var link = r.headers.get('link') || '';
                var nextMatch = link.split(',').find(function(l){ return l.includes('rel="next"'); });
                var nextUrl = nextMatch ? nextMatch.split(';')[0].trim().slice(1,-1) : null;
                r.json().then(function(data) {
                    results = results.concat(data);
                    if (nextUrl) getPage(nextUrl); else callback(results);
                });
            });
        }
        getPage(url);
    }

    // ---- Shared status dialog ----
    var dialog = document.createElement('div');
    dialog.id = 'rubric_toolbar_dialog';
    document.body.appendChild(dialog);

    function showMsg(text) {
        dialog.innerHTML = '<p style="font-family:sans-serif;padding:10px">' + text + '</p>';
        if (typeof $ !== 'undefined') {
            try { $(dialog).dialog({ buttons: {}, width: 400 }); } catch(e) {}
        }
    }
    function closeMsg() {
        try { if (typeof $ !== 'undefined') $(dialog).dialog('close'); } catch(e) {}
    }

    // ---- Apply a rubric assessment picking either max or min points per criterion ----
    function applyCredit(mode) {
        showMsg(mode === 'full' ? 'Applying full credit, please wait...' : 'Applying zero credit, please wait...');
        var courseId = window.location.pathname.split('/')[2];
        var assignId = new URLSearchParams(window.location.search).get('assignment_id');
        var studentId = getStudentId();
        if (!studentId) { showMsg('ERROR: Could not find student ID.'); return; }

        fetch('/api/v1/courses/' + courseId + '/assignments/' + assignId)
            .then(function(r) { return r.json(); })
            .then(function(assignment) {
                if (!assignment.rubric || !assignment.rubric.length) {
                    showMsg('ERROR: No rubric found for this assignment.'); return;
                }
                var params = new URLSearchParams();
                params.append('rubric_assessment[assessment_type]', 'grading');
                assignment.rubric.forEach(function(criterion) {
                    var chosen = criterion.ratings.reduce(function(a, b) {
                        if (mode === 'full') {
                            return b.points > a.points ? b : a;
                        } else {
                            return b.points < a.points ? b : a;
                        }
                    });
                    params.append('rubric_assessment[' + criterion.id + '][points]', chosen.points);
                    params.append('rubric_assessment[' + criterion.id + '][rating_id]', chosen.id);
                    params.append('rubric_assessment[' + criterion.id + '][comments]', '');
                });
                return fetch('/api/v1/courses/' + courseId + '/assignments/' + assignId + '/submissions/' + studentId, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-CSRF-Token': getCsrfToken()
                    },
                    body: params.toString()
                });
            })
            .then(function(r) {
                if (!r || !r.ok) {
                    showMsg('ERROR: API call failed with status ' + (r ? r.status : 'unknown'));
                    return;
                }
                closeMsg();
                alert((mode === 'full' ? 'Full credit' : 'Zero credit') + ' applied! Reloading...');
                window.location.reload();
            })
            .catch(function(err) { showMsg('ERROR: ' + err.message); });
    }

    // ---- Export rubric scores to CSV ----
    function exportRubricScores() {
        var courseId = window.location.pathname.split('/')[2];
        var assignId = new URLSearchParams(window.location.search).get('assignment_id');

        fetch('/api/v1/courses/' + courseId + '/assignments/' + assignId)
            .then(function(r){ return r.json(); })
            .then(function(assignment) {
                if (!assignment.rubric_settings) { alert('ERROR: No rubric settings found.'); return; }
                getAllPages('/api/v1/courses/' + courseId + '/enrollments?per_page=100', function(enrollments) {
                    getAllPages('/api/v1/courses/' + courseId + '/assignments/' + assignId + '/submissions?include[]=rubric_assessment&include[]=submission_comments&per_page=100', function(submissions) {
                        var critOrder = {}, critRatingDescs = {};
                        var header = ['Student Name','Student ID','Posted Score','Attempt Number','Comments'];
                        assignment.rubric.forEach(function(criterion, i) {
                            critOrder[criterion.id] = i;
                            critRatingDescs[criterion.id] = {};
                            criterion.ratings.forEach(function(r){ critRatingDescs[criterion.id][r.id] = r.description; });
                            header.push(csvEncode('Rating: ' + criterion.description));
                            header.push(csvEncode('Points: ' + criterion.description));
                        });
                        var rows = [header];
                        submissions.forEach(function(sub) {
                            var enr = enrollments.find(function(e){ return e.user_id === sub.user_id; });
                            if (!enr) return;
                            var u = enr.user;
                            var comments = (sub.submission_comments||[]).map(function(c){ return c.comment; }).join(' | ');
                            var row = [u.name, u.sis_user_id, sub.score, sub.attempt, csvEncode(comments)];
                            var crits = [];
                            if (sub.rubric_assessment) {
                                Object.keys(sub.rubric_assessment).forEach(function(k) {
                                    var v = sub.rubric_assessment[k];
                                    crits.push({ id: k, points: v.points, rating: (critRatingDescs[k]||{})[v.rating_id] });
                                });
                            }
                            crits.sort(function(a,b){ return critOrder[a.id]-critOrder[b.id]; });
                            crits.forEach(function(c){ row.push(csvEncode(c.rating)); row.push(c.points); });
                            rows.push(row);
                        });
                        var csv = rows.map(function(r){ return r.join(','); }).join('\n');
                        var a = document.createElement('a');
                        a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
                        var title = document.title.replace('SpeedGrader','').trim().replace(/[^a-zA-Z0-9]+/g,'_');
                        var context = document.getElementById('context_title')?.innerText || '';
                        a.download = title + '_' + context.replace(/[^a-zA-Z0-9]+/g,'_') + '.csv';
                        a.click();
                    });
                });
            });
    }

    // ---- Toolbar injection ----
    function buildToolbar() {
        if (document.getElementById('rubric_toolbar')) return true;

        var statsEl = document.querySelector('[data-testid="graded-students-count"]');
        var flexFlex = statsEl ? statsEl.closest('[class*="flex-flex"]') : null;
        var flexItem = flexFlex ? flexFlex.closest('[class*="flexItem"]') : null;

        var toolbar = document.createElement('div');
        toolbar.id = 'rubric_toolbar';
        toolbar.style.cssText = flexItem
            ? 'display:flex;gap:8px;align-items:center;margin-right:8px;'
            : 'position:fixed;top:6px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;gap:8px;background:#fff;padding:4px;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,0.25);';

        function makeButton(id, label, color, onClick) {
            var btn = document.createElement('button');
            btn.id = id;
            btn.textContent = label;
            btn.style.cssText = 'padding:6px 14px;border-radius:4px;border:none;cursor:pointer;font-size:13px;font-weight:500;background:' + color + ';color:#fff;white-space:nowrap;';
            btn.addEventListener('click', onClick);
            return btn;
        }

        toolbar.appendChild(makeButton('full_credit_btn', 'Full Credit', '#0770A3', function() { applyCredit('full'); }));
        toolbar.appendChild(makeButton('zero_credit_btn', 'Zero Credit', '#B4272B', function() { applyCredit('zero'); }));
        toolbar.appendChild(makeButton('export_rubric_btn', 'Export Rubric Scores', '#6a2c91', exportRubricScores));

        if (flexItem && flexItem.parentNode) {
            flexItem.parentNode.insertBefore(toolbar, flexItem);
        } else {
            document.body.appendChild(toolbar);
        }
        console.log('[RubricToolbar] Toolbar injected.');
        return true;
    }

    var attempts = 0;
    var timer = setInterval(function() {
        attempts++;
        if (buildToolbar() || attempts > 50) {
            clearInterval(timer);
        }
    }, 300);
})();
