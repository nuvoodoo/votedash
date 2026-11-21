# Member approval from the Cooperative Election Study

Run from this folder after downloading the CES cumulative file (Harvard Dataverse doi:10.7910/DVN/II2DB6, cumulative_2006-2025.feather) as cum.feather.

1. 1_extract.py: approval of each House member and senator, 2024 and 2025 surveys.
2. 2_fay_herriot.py: Fay-Herriot small-area model on member-level direct estimates, covariates = district or state share of co-partisans and opposite partisans, chamber. Includes a subsample validation against large-sample senators.
3. 3_write.py: writes server/congress/data/approval.json, keeping members with a margin of error of 10 points or less.
4. 4_by_year.py path/to/cum.feather: the same model fitted to each year 2019-2025 on its own; adds byYear to approval.json (shown under "Year by year" on the Polling tab).
