# WeBWorK to Canvas Homework Grades

A browser tool that combines WeBWorK scoring exports with written or upload rubric exports and fills the WeBWorK HW grade columns of a Canvas gradebook export, ready to import back into Canvas.

**Live tool:** https://mschurmann1.github.io/webwork_canvas_grades/

## Privacy

All files are read and processed entirely in the browser. No gradebook, WeBWorK, or rubric data is uploaded, stored on a server, or committed to this repository. The `.gitignore` blocks CSV and Excel files as an extra safeguard.

## What you need

1. **Canvas gradebook export** (Grades, Export, Export Entire Gradebook), with the WeBWorK HW grade columns present.
2. **WeBWorK scoring files**, one per homework set, with per problem scores.
3. **Written or upload rubric exports**, one per homework set, with a 0 or 1 for each problem.

Files can be dropped into any box. Each file is identified by its contents and sorted automatically.

## How scores are calculated

For each student and each problem:

`WeBWorK score (0 to 1) × problem value × rubric rating (0 or 1)`

The products are summed, divided by the total problem value for the set, and written as a percentage out of 100, rounded to two decimals.

**Order of sources for each student**

1. **Rubric fully rated:** per problem calculation above.
2. **Rubric row exists but is blank or only partly rated:** left blank. A 0 is never assumed.
3. **No rubric row, or no rubric file for the set:** WeBWorK percentage × (Canvas written or upload score ÷ points possible), only if that Canvas cell holds a number. Otherwise left blank.
4. **No WeBWorK record:** left blank.

Blank cells are not changed in the downloaded file, so Canvas receives no entry for those students.

## Matching

**Sets** are paired by section number, whatever the naming convention: `Sec 2.4`, `Section 1.5`, `HW 2.4`, `Part 2`, `Pt II`, `Part B`. Course numbers and dates in file names are ignored.

**Output column:** columns named WeBWorK, HW, or Grade are preferred. Columns named Written, Upload, or Rubric are never chosen automatically; they are used as the Canvas backup source instead. Every choice can be changed from a dropdown, and output choices are remembered in the browser.

**Students** are matched to Canvas in this order:

1. abc123 ID (or Canvas ID) when the rubric export includes one
2. Exact full name (Canvas or WeBWorK)
3. Same names in a different order
4. Middle names or initials missing, hyphens or accents different (only when exactly one student fits)
5. Manual pick from the roster, remembered in the browser

Partial name matches are listed for confirmation before download.

## Updating the tool

Replace `index.html` with the new version and commit. GitHub Pages republishes automatically within a few minutes.
