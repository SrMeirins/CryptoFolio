; Hooks personalizados del installer NSIS

; Ejecutado en .onInit (arranque del installer, antes de cualquier página).
; Mata CryptoFolio.exe y postgres.exe para evitar el diálogo "cannot be closed"
; y liberar el bloque de memoria compartida de PostgreSQL.
; ExecWait con taskkill devuelve error si el proceso no existe — lo ignoramos.
!macro customInit
  ExecWait 'taskkill /F /IM "CryptoFolio.exe"'
  ExecWait 'taskkill /F /IM "postgres.exe"'
  Sleep 2000
!macroend
