; Hooks personalizados del installer NSIS
; Referencia: https://www.electron.build/configuration/nsis

; Mostrar el panel de detalles de instalación (lista de archivos copiados).
; Sin esto la barra de progreso avanza sin ninguna información al usuario.
!macro customHeader
  ShowInstDetails show
  ShowUninstDetails show
!macroend

; Ejecutado al arrancar el installer (.onInit), antes de mostrar ninguna página.
; Mata CryptoFolio si está corriendo para evitar el diálogo "no se puede cerrar".
!macro customInit
  DetailPrint "Comprobando si CryptoFolio está en ejecución..."
  nsExec::ExecToStack 'tasklist /FI "IMAGENAME eq CryptoFolio.exe" /NH'
  Pop $0
  Pop $1
  ${If} $1 != ""
  ${AndIf} $1 != "INFO: No tasks are running which match the specified criteria."
    DetailPrint "Cerrando CryptoFolio..."
    nsExec::Exec 'taskkill /F /IM "CryptoFolio.exe"'
    Sleep 1500
  ${EndIf}
!macroend
