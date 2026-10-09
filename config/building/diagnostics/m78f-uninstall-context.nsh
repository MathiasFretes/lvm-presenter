; QA-only NSIS include. Add with nsis.include in a temporary build config.
; Never include this file in a published installer.
; The marker is intentionally retained for a read-only HKEY_USERS/SID check.

!macro LvmQaContextLog LINE
  FileOpen $R9 "$TEMP\lvm-m78f-qa5-context.log" a
  FileSeek $R9 0 END
  FileWrite $R9 "${LINE}$\r$\n"
  FileClose $R9
!macroend

; The diagnostic-only template patch invokes this immediately before
; electron-builder's initMultiUser, which reads InstallLocation.
!macro LvmQaBeforeUnInit
  FileOpen $R9 "$TEMP\lvm-m78f-qa5-context.log" w
  FileWrite $R9 "UNINSTALL_START$\r$\n"
  FileClose $R9

  ReadEnvStr $R0 "USERNAME"
  UserInfo::GetName
  Pop $R1
  UserInfo::GetAccountType
  Pop $R2
  StrCpy $R3 "no"
  ${If} ${UAC_IsAdmin}
    StrCpy $R3 "yes"
  ${EndIf}

  !insertmacro LvmQaContextLog "env_username=$R0 userinfo_name=$R1 account_type=$R2 elevated_admin=$R3"
  !insertmacro LvmQaContextLog "profile=$PROFILE"
  !insertmacro LvmQaContextLog "temp=$TEMP appdata=$APPDATA localappdata=$LOCALAPPDATA"
  !insertmacro LvmQaContextLog "app_guid=${APP_GUID} instdir=$INSTDIR"

  ClearErrors
  WriteRegStr HKCU "Software\LVM-M78F-Diagnostic" "marker" "QA5"
  StrCpy $R6 "0"
  ${If} ${Errors}
    StrCpy $R6 "1"
  ${EndIf}
  !insertmacro LvmQaContextLog "marker_write_error=$R6"

  WriteRegStr HKCU "Software\LVM-M78F-Diagnostic" "username" "$R1"
  WriteRegStr HKCU "Software\LVM-M78F-Diagnostic" "account_type" "$R2"
  WriteRegStr HKCU "Software\LVM-M78F-Diagnostic" "elevated_admin" "$R3"
  WriteRegStr HKCU "Software\LVM-M78F-Diagnostic" "temp" "$TEMP"
  WriteRegStr HKCU "Software\LVM-M78F-Diagnostic" "appdata" "$APPDATA"
  WriteRegStr HKCU "Software\LVM-M78F-Diagnostic" "localappdata" "$LOCALAPPDATA"

  !insertmacro LvmQaContextLog "BEFORE_INIT_MULTI_USER"
!macroend

; electron-builder calls this after initMultiUser has selected current/all.
!macro customUnInit
  !insertmacro LvmQaContextLog "AFTER_INIT_MULTI_USER install_mode=$installMode"
  ClearErrors
  ReadRegStr $R7 SHELL_CONTEXT "Software\LVM-M78F-Diagnostic" "marker"
  StrCpy $R6 "0"
  ${If} ${Errors}
    StrCpy $R6 "1"
  ${EndIf}
  !insertmacro LvmQaContextLog "shell_context_marker=$R7 shell_context_read_error=$R6"
  !insertmacro LvmQaContextLog "UNINSTALL_INIT_END"
!macroend
