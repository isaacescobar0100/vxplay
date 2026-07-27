; Script propio que electron-builder inserta al final de la instalacion.
;
; Por que existe: electron-builder NO crea el acceso directo del escritorio
; cuando la instalacion viene de una actualizacion automatica. En su
; installer.nsh la rama que lo crearia esta dentro de un `${ifNot} ${isUpdated}`,
; asi que con updates silenciosos el icono nunca se recrea y el cliente se queda
; sin el. Poner createDesktopShortcut en "always" NO alcanza por ese mismo motivo.
;
; Aca se crea siempre. Se respeta --no-desktop-shortcut por si alguna vez se
; quiere instalar sin icono.
!macro customInstall
  ${ifNot} ${isNoDesktopShortcut}
    ; Atajo roto de cuando la app se llamaba "POS Tienda de Ropa": apunta a un
    ; .exe que ya no existe, por eso al cliente le queda el icono en blanco y al
    ; abrirlo dice "se cambio o se movio el elemento". Se borra para no dejar dos.
    ${if} ${FileExists} "$DESKTOP\POS Tienda de Ropa.lnk"
      WinShell::UninstShortcut "$DESKTOP\POS Tienda de Ropa.lnk"
      Delete "$DESKTOP\POS Tienda de Ropa.lnk"
    ${endIf}

    ; Se crea (o se pisa, si estaba apuntando mal) el atajo bueno.
    CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" \
      "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
    ; Refresca el escritorio para que el icono aparezca sin tener que dar F5.
    System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  ${endIf}
!macroend
