# Shockwave PMO deployment changelog

After each successful deployment of the existing Shockwave PMO Site
(`YOUR_SITES_PROJECT_ID`), update the
Rekap Perubahan Google Sheet configured by the project owner
before closing the deployment task. This sheet is the UI/UX changelog requested
by the project editor.

- Confirm that Sites reports a successful deployment and look up the published
  version number from the matching saved version.
- Read the tab and check whether that version is already recorded. Append one
  row for a new version. For an existing version, preserve the row and add
  details only if a verified change is missing.
- Follow the existing columns in order: Nomor Versi, Timestamp, Area,
  Menu/Modul, Before, After. Use Area for the broad part of the application
  and Menu/Modul for the specific feature or screen. If a change covers
  several menus or modules, use a comma-separated list in Menu/Modul.
  Write in Indonesian and use the confirmed deployment time in Asia/Jakarta
  as `YYYY-MM-DD HH:mm:ss WIB`.
- Use the available spreadsheet integration when it can edit the workbook.
  The target is an Excel workbook opened in Google Sheets. When needed, use
  the Sheets editor to append the row in the existing tab.
- Read the row back and confirm it was saved. Report any write or verification
  blocker alongside the deployment result. Leave existing rows and workbook
  access settings in place.
