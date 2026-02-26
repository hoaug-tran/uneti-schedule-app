!include LogicLib.nsh

!macro customUnInstall
  nsExec::ExecToLog 'taskkill /F /IM "Widget lịch học UNETI.exe" /T'
  Sleep 1000
  
  nsExec::ExecToLog 'cmdkey /delete:LegacyGeneric:target=uneti-schedule-app/cookies'
!macroend
