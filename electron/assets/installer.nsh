; Hooks personalizados del installer NSIS

; Muestra el panel de detalles (el panel existe pero electron-builder
; extrae con 7z internamente — los DetailPrint de abajo son los que aparecen).
!macro customHeader
  ShowInstDetails show
  ShowUninstDetails show
!macroend

; Ejecutado en .onInit (arranque del installer, antes de cualquier página).
; Mata CryptoFolio.exe y postgres.exe para evitar el diálogo "cannot be closed"
; y liberar el bloque de memoria compartida de PostgreSQL.
; ExecWait con taskkill devuelve error si el proceso no existe — lo ignoramos.
!macro customInit
  ExecWait 'taskkill /F /IM "CryptoFolio.exe"'
  ExecWait 'taskkill /F /IM "postgres.exe"'
  Sleep 2000
!macroend

; Mensajes de fase para que el panel no quede completamente vacío.
!macro customInstall
  DetailPrint "CryptoFolio instalado correctamente."
!macroend
