# Chart AI Signal v5 v3

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


## Cambios v3
- Señales COMPRA/VENTA con flechas visuales.
- Hora de entrada y duración de 5 minutos destacadas.
- Bloques de configuración detectada e invalidación.
- ESPERAR se mantiene cuando no hay una entrada clara.


## Novedades v4
- Muestra hora de inicio y hora de finalización de cada entrada (5 minutos).
- Guarda en el navegador un historial de hasta 50 entradas COMPRA/VENTA.
- El historial permanece en ese dispositivo/navegador hasta que se borren sus datos o se pulse “Borrar”.


## Historial demo v5
Cada señal COMPRA/VENTA se guarda como PENDIENTE. Al finalizar la operación, el usuario puede marcarla manualmente como WIN o LOSS. La app calcula la acertividad como WIN / (WIN + LOSS); las pendientes no cuentan. El historial se guarda localmente en el navegador del dispositivo.
