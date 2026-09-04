# Chart AI Signal V15

V15 compara dos perfiles de Martingala 1 sin usar el 30% final para escogerlos.

- **Conservador:** prioriza menor racha y drawdown, manteniendo neto positivo.
- **Neto+:** permite hasta 4 ciclos perdidos consecutivos y DD de hasta 10 unidades en desarrollo+confirmación para buscar mayor neto.
- Después, ambos perfiles se congelan y se evalúan por separado en el 30% final fuera de muestra.
- La pantalla muestra neto, acierto de ciclos, drawdown, racha máxima y cantidad de MG1 de cada perfil.

Esto permite comprobar si aceptar más riesgo realmente mejora el resultado en datos no usados para elegir la regla.

Simulación histórica/educativa con supuesto 1:1: 1 unidad inicial y 2 unidades en MG1. No garantiza resultados futuros ni ejecuta operaciones.
