!include LogicLib.nsh

Var MyLocalAppData

!macro preInit
  ReadEnvStr $MyLocalAppData "LOCALAPPDATA"
  ${If} $MyLocalAppData == ""
    SetShellVarContext all
  ${Else}
    ClearErrors
    CreateDirectory "$MyLocalAppData\\Programs\\_installtest"
    IfErrors 0 +2
      SetShellVarContext all
    RMDir "$MyLocalAppData\\Programs\\_installtest"
  ${EndIf}
!macroend

!macro customUnInstall
  ; Delete Windows credentials stored by keytar
  ; Target format: LegacyGeneric:target=uneti-schedule-app/cookies
  nsExec::ExecToLog 'cmdkey /delete:LegacyGeneric:target=uneti-schedule-app/cookies'
!macroend
