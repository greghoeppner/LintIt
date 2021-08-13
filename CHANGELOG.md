# Change Log

## 0.3.2

- Fixed issue where the files were no longer being detected in the document scan.

## 0.3.1

- Added setting for the file extensions to include in the scan.

## 0.3.0

- Changed the settings to allow for multiple configurations to be done per source folders.
- Added setting for providing library include folders. PC-Lint +libdir(directory) command.

## 0.2.3

- Changed the settings for agressive mode and legacy mode to be configured at the workspace level as well as the user level.

## 0.2.2

- Agressive mode will now initiate linting of all the open files when saving/opening/closing header files.

## 0.2.1

- Updated agressive mode to work with the new direct calling method.
- Added a summary at the end of the full lint.

## 0.2.0

- Added the direct calling of PC-Lint rather than using a batch file to run PC-Lint.

## 0.1.2

- Security update.

## 0.1.1

- Updated packages to fix vulnerability.

## 0.1.0

- Added aggressive mode. This causes all the open files to be linted on any change in the editor. Might cause the system to slow down but will better update the problems lists.

## 0.0.6

- Added output for when no exceptions were found.

## 0.0.5

- Fixed crash issue.

## 0.0.4

- Fixed issue where the path is blank.

## 0.0.3

- Fixed repository path.

## 0.0.2

- Fixed the creation of the output channel.
- Fixed missing keyword in message detection.
- Fixed crash when line number is 0.

## 0.0.1

- Initial release