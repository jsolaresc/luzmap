# LuzMap: mapeo de proyección estilo "lazy lighting", 100% gratis

El proyector muestra la salida en su navegador. Desde el celular dibujás las zonas, les asignás efectos de luz, imágenes o videos y lo ves cambiar en la pared en vivo. Solo necesita Node.js y no tiene dependencias.

```
luzmap/
  server.js          servidor (estado + archivos + sincronización en vivo)
  public/display.html  lo que proyecta el HY300
  public/control.html  editor para el celular
  public/luzmap.js     motor de render (homografía + efectos)
  media/             tus fotos/videos subidos
  state.json         tus zonas (se guarda solo)
```

## Opción A: todo en el HY300 (sin Raspberry)

El HY300 es Android 11, así que corre Termux.

1. **Instalá Termux** (APK de F-Droid o de GitHub, *no* el de Play Store) en el proyector. Pasalo por pendrive y abrilo con el administrador de archivos.
   Conviene un teclado USB o Bluetooth para los pasos 2-3, aunque solo se hacen una vez.
2. En Termux:
   ```
   pkg update && pkg install nodejs
   termux-setup-storage
   cp -r /sdcard/Download/luzmap ~/luzmap     # (o donde hayas copiado la carpeta)
   termux-wake-lock
   node ~/luzmap/server.js
   ```
3. **Navegador del proyector:** instalá un navegador basado en Chrome y abrí `http://localhost:8080/display`.
   Apretá **OK** en el control remoto para pasar a pantalla completa.
4. **Celular** (misma red Wi-Fi): abrí `http://IP-DEL-PROYECTOR:8080`.
   La IP se muestra en la pantalla proyectada. Si no aparece, está en Ajustes > Wi-Fi del proyector.

Arranque automático (opcional): instalá **Termux:Boot** y creá `~/.termux/boot/luzmap.sh` con:
```
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
node ~/luzmap/server.js
```

## Opción B: Raspberry Pi 3 por HDMI

```
sudo apt install -y nodejs chromium-browser
node ~/luzmap/server.js &
chromium-browser --kiosk --autoplay-policy=no-user-gesture-required http://localhost:8080/display
```
Con el HY300 en la entrada HDMI. El celu se conecta igual, a `http://IP-DE-LA-PI:8080`.
La Pi 3 anda bien con efectos de luz y fotos. Con varios videos a la vez se queda corta: usá clips cortos a 720p o menos.

## Cómo se usa

1. **Calibrar** (encendido): el proyector muestra grilla, contornos y esquinas numeradas.
2. **+ Rectángulo**: arrastrá las 4 esquinas en el celu mirando la pared hasta que calcen con el objeto (cuadro, repisa, mueble).
   - **Fino** hace que el arrastre vaya 5× más lento.
   - Las **flechas** mueven el punto seleccionado de a 1/5/20 px. Mantenelas apretadas para repetir.
   - El botón del medio cambia entre mover **pto** (punto) o **zona** entera.
   - Arrastrar por dentro de la zona la mueve entera.
3. **+ Polígono**: formas libres (estrella, contorno de una planta, etc). Con **+ punto / − punto** agregás o sacás vértices.
4. Elegí un **efecto**: color fijo, respiración, estroboscópico, barrido de luz, llenado, degradé, arcoíris, borde, trazo (dibuja el contorno), imagen, video o negro (máscara).
5. **Secuencia: escalonar desfases** reparte los tiempos entre zonas, así la luz "viaja" de una a otra. Es el efecto clásico de lazy lighting.
6. Apagá **Calibrar** para el show final. **Apagar** hace un blackout instantáneo.

Notas:
- Los rectángulos deforman imágenes y videos en perspectiva (homografía real). En los polígonos el contenido se recorta con la forma, sin perspectiva. Si querés las dos cosas, poné un rectángulo con el video y encima un polígono "Negro (máscara)".
- El orden de las zonas es el orden de capas. Los botones Adelante/Atrás lo cambian.
- Exportar/Importar guarda escenas como JSON.
- Se pueden conectar varios celulares a la vez.
- Si un video no arranca en el proyector, apretá OK en el control remoto: es la política de autoplay del navegador.
