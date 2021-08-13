# Lint It Readme

A PC-Lint error parser

## Features

- Parses PC-Lint output and generates clickable errors and warnings.

## Requirements

Requires PC-Lint to be installed.

Use the settings described in the extension settings to lint your files.

### Legacy Mode

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

- lintit.pcLintLocation - string - The location of PC-Lint. Example: "lintit.pcLintLocation": "c:\\\\PC-Lint\\\\lint-nt.exe"
- lintit.configurations - array - A list of configurations
    - lintFiles - array - The list of .lnt files to include when linting. Example: "lintFiles": ["${workspaceFolder}/lint/app.lnt"]
    - extensions - array - A list of extensions to scan. Example: "extensions": [".c",".cpp"]
    - sourceFolders - array - The folders to include for detecting source files that require linting. The folders search is recursive. Example: "sourceFolders": ["${workspaceFolder}/source"]
    - libraryIncludeFolders - array - The library include folders "+libdir(directory)". Example: "libraryIncludeFolders": "${workspaceFolder}/driver_interface"
    - includeFolders - array - The include folders to use when linting files (automatically prefixed with -i when sending to PC-Lint). Example:
```
	"includeFolders": [
        "${workspaceFolder}/lint", 
        "${workspaceFolder}/common/FreeRTOS/include", 
        "${workspaceFolder}/common/FreeRTOS/portable/IAR/ARM_CM3", 
        "${workspaceFolder}/driver_source", 
        "${workspaceFolder}/driver_interface"
    ]
```
- lintit.agressiveMode - boolean - Enables aggressive mode. Scans all open files for lint issues on saving a file.
- lintit.legacyMode - boolean - Enables legacy mode. None of the above options work when using legacy mode. Legacy mode requires a lint.bat file to be present in the workspace root folder.

## Deprecated Settings
- lintit.lintFiles - array - The list of .lnt files to include when linting. Example: "lintit.lintFiles": ["${workspaceFolder}/lint/app.lnt"]
- lintit.sourceFolders - array - The folders to include for detecting source files that require linting. The folders search is recursive. Example: "lintit.sourceFolders": ["${workspaceFolder}/source"]
- lintit.includeFolders - array - The include folders to use when linting files (automatically prefixed with -i when sending to PC-Lint). Example:
```
	"lintit.includeFolders": [
        "${workspaceFolder}/lint", 
        "${workspaceFolder}/common/FreeRTOS/include", 
        "${workspaceFolder}/common/FreeRTOS/portable/IAR/ARM_CM3", 
        "${workspaceFolder}/driver_source", 
        "${workspaceFolder}/driver_interface"
    ]
```


## Known Issues

None at this time.
