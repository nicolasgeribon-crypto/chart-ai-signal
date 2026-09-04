# Chart AI Signal v2

Aplicación web instalable (PWA) para Android que recibe una captura de un gráfico y usa visión de OpenAI para devolver una lectura visual estructurada: COMPRA, VENTA o NO OPERAR; minuto sugerido; duración fija de 5 minutos; confianza visual; tendencia; soporte; resistencia y explicación.

## Probar en computadora

1. Instala Node.js 20 o superior.
2. En esta carpeta ejecuta `npm install`.
3. Crea la variable de entorno `OPENAI_API_KEY`. No pongas la clave dentro de `public/app.js` ni la compartas por chat.
4. Opcional: `OPENAI_MODEL=gpt-5.6-luna`.
5. Ejecuta `npm start` y abre `http://localhost:3000`.

## Instalar en Android

La PWA necesita estar publicada por HTTPS para que Android ofrezca instalarla. Una vez publicada, abre la URL en Chrome/Brave y toca **Instalar** cuando aparezca el botón. Al instalarse se abre sin la barra `content://...` del navegador.

## Publicar

El proyecto incluye `render.yaml` para facilitar el despliegue en un servicio Node compatible. En el servicio de hosting configura `OPENAI_API_KEY` como variable secreta del servidor. Nunca la incluyas en archivos públicos.

## Importante

La aplicación analiza únicamente la información visible en una captura. La confianza mostrada representa claridad del análisis visual, no probabilidad de ganancia. La app no ejecuta operaciones ni puede garantizar resultados.
