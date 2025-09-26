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
