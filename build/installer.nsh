!include LogicLib.nsh

!macro customInstall
  Delete "$INSTDIR\resources\app.asar"
  RMDir /r "$INSTDIR\resources\app"
  RMDir /r "$INSTDIR\locales"
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'taskkill /F /IM "Widget lịch học UNETI.exe" /T'
  Sleep 1000
  
  nsExec::ExecToLog 'cmdkey /delete:LegacyGeneric:target=uneti-schedule-app/cookies'
!macroend
