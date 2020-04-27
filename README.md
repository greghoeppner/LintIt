# Lint It Readme

A PC-Lint error parser

## Features

- Parses PC-Lint output and generates clickable errors and warnings.

## Requirements

Requires PC-Lint to be installed.

For setting up this plugin to use. At the moment, I didn't have time to add configuration options. This
means that right now, to use the plugin the plugin tries to run a file called 'lint.bat' in the workspace root folder.
The plugin then reads any output from the batch file. The format that it is looking for PC-Lint to be setup with is as
follows:

```
if "%1"=="" (
	for /r %%a in (*.c) do (
		C:\PC-lint\lint-nt.exe -elib^(0^) +ffn -width^(0^) -hf1 -u -"format=%%f(%%l): %%t %%n: %%m" -i"c:\PC-Lint" -i"c:\PC-Lint\lnt" c:\PC-Lint\std.lnt %%a
	)
)

if not "%1"=="" (
	C:\PC-lint\lint-nt.exe -elib^(0^) +ffn -width^(0^) -hf1 -u -"format=%%f(%%l): %%t %%n: %%m" -i"c:\PC-Lint" -i"c:\PC-Lint\lnt" c:\PC-Lint\std.lnt %1
)
```

## Extension Settings

None at this time.

## Known Issues

None at this time.

## Release Notes

### 0.0.5

- Fixed crash issue.

### 0.0.4

- Fixed issue where the path is blank.

### 0.0.3

- Fixed repository path.

### 0.0.2

- Fixed the creation of the output channel.
- Fixed missing keyword in message detection.
- Fixed crash when line number is 0.

### 0.0.1

- Initial release.
