# NovelForge — herramienta de creación IA todo-en-uno

> **🌐 Idiomas**
> [简体中文](README.md) · [English](README.en.md) · [Français](README.fr.md) · [Русский](README.ru.md) · Español · [Português](README.pt.md)
> Novedades en el [CHANGELOG](CHANGELOG.md).

---

Herramienta de creación con IA local, grande y totalmente personalizable, que unifica bajo un marco de capacidades la **escritura de novelas** con la **imitación/continuación/reescritura de contenido, la redacción de resolución del Consejo de Seguridad y el correo académico de contacto**, y admite además la **escritura multilingüe**. El flujo de escritura de novelas: **idea inicial → ruta narrativa (planteamiento del esquema) → ambientación del mundo → personajes → esquema de capítulos → texto de los capítulos**; cada resultado generado por IA puede **previsualizarse antes de guardarse, editarse libremente, regenerarse, afinarse por puntos concretos y revertirse por completo (deshacer)**. Admite la conexión con interfaces compatibles con OpenAI (incluidas las de distintos fabricantes nacionales), Gemini y Grok/xAI; incorpora un **motor de simulación sin conexión** y novelas de ejemplo, por lo que **no se necesita ninguna API Key para experimentar todas las funciones por completo**.

Cero dependencias de terceros (solo la librería estándar pura de Node.js + el navegador nativo) y todos los datos se guardan en el equipo local.

---

## Inicio rápido

Requisitos: Node.js ≥ 18.17 (se recomienda 20+).

```bash
# Opción 1: ejecución directa
node server/index.js

# Opción 2: doble clic en run.bat en Windows (abre el navegador automáticamente)
```

Tras el arranque, **el navegador se abre automáticamente** en http://127.0.0.1:7390 (definir la variable de entorno `NOVEL_NO_OPEN=1` desactiva la apertura automática; `NOVEL_PORT` cambia el puerto y `NOVEL_DATA` cambia el directorio de datos). Si se indica que el puerto está ocupado, significa que ya hay una instancia en ejecución: basta con acceder a esa dirección.

### Control del servicio (modo de fondo, Windows)

Cuando no se quiera ocupar la ventana de primer plano, se puede usar `novel-ctl.bat` para iniciar y detener el servicio como **proceso en segundo plano** (los registros se escriben en `data/server.log` y el PID se guarda en `data/server.pid`):

```bat
novel-ctl.bat          rem = estado (predeterminado)
novel-ctl.bat status   rem consulta estado/puerto/PID de ejecución
novel-ctl.bat start    rem inicio en segundo plano (sin ventana, sin abrir navegador)
novel-ctl.bat stop     rem detiene el servicio
novel-ctl.bat restart  rem reinicia
novel-ctl.bat start 7400   rem permite especificar el puerto; o, sin puerto, lee NOVEL_PORT / settings
```

En el primer arranque se realiza automáticamente:
1. Se escriben los ajustes predeterminados (preajustes de 12 fabricantes + 25 plantillas de prompt);
2. Se crea el proyecto de ejemplo integrado «Ejemplo · Carta del puerto de niebla» (misterio fantástico: biblioteca de ambientación / 6 fichas de personajes / esquema de 2 volúmenes y 10 capítulos / 2 capítulos de texto de ejemplo / archivo de continuidad);
3. Motor predeterminado = motor de simulación sin conexión → abre «Configuración → Motor predeterminado» para cambiarlo a tu modelo real.

---

## Flujo de creación (siete fases + exportación)

| Fase | Qué se hace | Capacidades clave |
|---|---|---|
| ① Idea inicial | Título/una frase/contexto/conflicto/tono | Lluvia de ideas con IA (8 candidatos, se adoptan uno a uno), profundización en un clic hasta convertirlo en proyecto |
| ② Ruta narrativa (planteamiento del esquema) | 2~5 candidatas: planteamiento general / ruta por etapas / escalada del conflicto principal / dirección del desenlace / sacrificios y riesgos | La IA genera las candidatas + **selección humana** (por número / ruta propia / adoptar la recomendación de la IA); **solo tras seleccionarla el esquema la seguirá estrictamente**; es el paso clave para evitar que «el esquema se disperse» |
| ③ Ambientación del mundo | Resumen / reglas de hierro / secciones de ambientación / glosario | La IA genera el conjunto completo, ampliación incremental, refinamiento por secciones; las reglas de hierro se inyectan automáticamente en cada escritura |
| ④ Personajes | Ficha de personaje con todos los campos | Generación de los personajes / añadir / refinamiento IA por ficha / **calibración de coherencia del conjunto** (verificación cruzada de edades, relaciones y línea temporal) |
| ⑤ Esquema de capítulos | Volúmenes, objetivo+ritmo+apariciones+punto de vista+recuento por capítulo | Esquema completo con IA (arco de volumen, con la ruta seleccionada inyectada), añadir N capítulos, refinamiento de un capítulo, añadir capítulos manualmente/ordenar/cambiar de volumen/reordenar |
| ⑥ Escritura de capítulos | Editor de texto | Escritura en streaming/continuación/reescritura completa/pulido general/reescritura local de un pasaje seleccionado; autoguardado y recuento de palabras en tiempo real; **serialización automática sin supervisión** (escribe automáticamente todos los capítulos restantes según el esquema) |
| ⑦ Revisión de continuidad | Archivo de memoria + resumen de presagios + base de estilo + revisión del texto completo | Cada capítulo se archiva automáticamente como «resumen+hechos+estado de los presagios» y se inyecta en la escritura posterior; revisión final a nivel de editor con IA (lógica/línea temporal/conflictos de ambientación/OOC/estilo/erratas); el informe se guarda sin contaminar el texto |
| Exportación | Descarga en un clic | `book.md` libro final / `manuscript.md` borrador completo de la creación (incluye la ruta narrativa) / `book.txt` texto sin formato / `backup.json` copia de seguridad del proyecto |

> **Por qué la ruta es obligatoria**: sin una restricción de ruta, el modelo tiende a oscilar entre «el tema, la forma de escalar el conflicto y la dirección del desenlace», y el esquema resultante pierde el foco de una parte a otra.
> Por eso esta herramienta convierte la «ruta narrativa (planteamiento del esquema)» en un **paso previo** del esquema: incluso una idea de un solo párrafo debe ofrecer primero varias rutas entre las que elegir.
> La «automatización total en un clic» sin supervisión también ejecuta antes este paso y toma como guía la ruta recomendada por la IA (con una persona presente, se recomienda seleccionarla manualmente).

Siempre disponible: **«Deshacer» en la barra superior** (los cambios aplicados por la IA y los estructurales pueden revertirse en todo el proyecto, 60 pasos), el progreso del flujo a la izquierda, los «registros de ejecución» abajo a la derecha y «Configuración» arriba a la derecha.

### Serialización automática sin supervisión
Cuando el esquema está listo (o en cualquier momento): «⚡ Todo automático en un clic» en la barra lateral recorre desde la etapa que falte hasta completar el manuscrito; en la página de escritura, «⚡ Esquema → serialización automática sin supervisión» escribe todos los capítulos restantes. Durante la ejecución se puede **pausar / continuar / detener**; cada capítulo hace automáticamente: escribir el texto → resumen → archivo de hechos y estado de presagios → capítulo siguiente.

---

## Conexión con modelos reales

Abre **⚙ Configuración**:
1. **Fabricante del modelo**: vienen preinstalados OpenAI, DeepSeek, Tongyi Qianwen (Qwen/DashScope), Zhipu GLM, Kimi (Moonshot), iFlytek Spark, Doubao (Volcano Ark), SiliconFlow, Ollama (local), Grok (xAI), Gemini y el motor de simulación.
2. Rellena la **BaseURL / API Key** (se puede dejar vacía si no se introduce Key o si es un endpoint local como `ollama`); dentro del fabricante se pueden añadir o quitar **filas de modelo** (ID del modelo / nombre mostrado / ventana de contexto — la ventana sirve para recortar automáticamente el presupuesto de contexto).
3. Pulsa **⛁ Probar conexión** para verificarlo; **⇣ Obtener lista de modelos** puede traerla en línea.
4. Cualquier **endpoint compatible con OpenAI** que no admita preajustes integrados: pulsa «＋ Fabricante personalizado compatible con OpenAI» y rellena la BaseURL hasta `/v1`.
5. **Motor y parámetros de generación predeterminados**: fabricante/modelo predeterminado, temperatura, máx. tokens de salida y recuento objetivo de palabras por capítulo.
6. En el panel de generación de cada acción de IA también se puede cambiar temporalmente el motor y la temperatura (solo tiene efecto en esta sesión).

### Protocolos ya adaptados
- `kind: openai`: `POST {baseURL}/chat/completions` (OpenAI/DeepSeek/Qwen/GLM/Kimi/iFlytek/Doubao/SiliconFlow/Ollama/Grok y cualquier otro endpoint compatible), con soporte de streaming SSE y reintento automático en 429
- `kind: gemini`: `generateContent` / `streamGenerateContent?alt=sse`
- `kind: mock`: motor de simulación sin conexión local (sin red y sin Key)

---

## Plantillas de prompt (personalizables)

Configuración → **Biblioteca de plantillas de prompt**: 25 plantillas agrupadas por fases, que pueden editarse en línea en los prompts de System/User (los marcadores de posición `{{ideaText}}`, `{{bibleText}}`, `{{charsText}}`, `{{curRowText}}`, `{{contText}}`, etc. los inyecta automáticamente el sistema); los cambios surten efecto de inmediato en todas las generaciones posteriores; se puede hacer «Restablecer todo a los valores integrados» en un clic. Las especificaciones de salida de las acciones tipo JSON (JSON puro, sin bloques de código) y las normas de maquetación de las acciones de texto (solo texto, sin notas explicativas) las añade automáticamente el sistema.

---

## Datos y seguridad

- Todos los datos están en el equipo local: `data/projects/*.json` (un archivo por libro, que contiene todos los datos de creación y el historial) y `data/settings.json` (fabricantes y Key).
- Copiar un proyecto equivale a una instantánea a nivel de archivo; exportar `backup.json` permite un archivado a largo plazo.
- El servicio solo escucha por defecto en `127.0.0.1` (se puede cambiar `server.bind` a `0.0.0.0` en `data/settings.json` para abrirlo a la red local; hay que custodiar las Key).
- La API Key del modelo se guarda en texto plano en el archivo de configuración local — esta herramienta está pensada como mesa de escritura personal local; no debe desplegarse en entornos no fiables.

---

## Estructura de directorios

```
novel-forge/
├─ run.bat / package.json         # inicio y scripts
├─ server/                        # servidor Node sin dependencias
│  ├─ index.js                    # entrada: alojamiento estático + rutas
│  ├─ api.js                      # rutas REST/SSE
│  ├─ store.js                    # almacenamiento de proyectos / operaciones de colección / deshacer
│  ├─ llm.js                      # pasarela LLM unificada (compatible con OpenAI/Gemini/simulación)
│  ├─ templates.js                # 25 plantillas de prompt integradas
│  ├─ context.js                  # ensamblado del contexto del proyecto y recorte del presupuesto
│  ├─ actions.js                  # 25 acciones de generación (19 de novela + 6 de capacidad)
│  ├─ pipeline.js                 # flujo de serialización automática sin supervisión
│  ├─ export.js                   # exportación de libro/borrador/TXT/JSON
│  ├─ seedDemo.js / defaults.js / settings.js / events.js / util.js
├─ public/                        # frontend del navegador (módulos ES nativos, sin compilación)
│  ├─ index.html / css/style.css
│  └─ js/ app.js + views/* (9 páginas) + components/genPanel.js
├─ scripts/                       # comprobación y aceptación
└─ data/                          # datos de ejecución (se crean automáticamente)
```

## Relación con la versión para el plugin de DSH (repositorio separado · fuente única del motor)

Este repositorio es **la única fuente de verdad del motor de escritura de novelas**, con un propósito especializado: solo hace la herramienta de creación idea→**ruta narrativa**→ambientación→personajes→esquema→texto.
La versión para el plugin de DSH (`dsh-novel-forge`, repositorio/directorio independiente `../novel-forge-plugin`) se encarga de la orquestación de servicios en el ecosistema del harness y de las herramientas de sesión `novel_forge_*`; **incorpora un espejo de este motor** (`app/server`, `app/public`)
que se sincroniza unidireccionalmente con la herramienta de espejo para evitar que las dos copias diverjan:

```sh
# ejecutar dentro del repositorio del plugin:
node scripts/engine-mirror.mjs verify   # verifica que el espejo del motor es idéntico (solo pasa con 0 divergencias)
node scripts/engine-mirror.mjs sync     # sincroniza server/ public/ de este repositorio en app/ del plugin y lo vuelve a verificar
```

Convención: **los cambios de comportamiento del motor solo se hacen en este repositorio** (tras modificarlo se ejecutan las pruebas → `sync` en el repositorio del plugin → las tres suites de autocomprobación del plugin);
el repositorio del plugin solo escribe código del lado del harness (servicio de index.js / tools.js / UI del cliente) y no modifica el contenido de `app/`.

## Pruebas y aceptación

```bash
node scripts/check-syntax.js      # toda la sintaxis JS (ESM del servidor + del navegador)
node scripts/check-imports.js     # integridad de las importaciones de módulos del frontend
node scripts/test-route.js        # etapa de ruta narrativa (plantilla/acción/inyección de {{routeText}}, 17 ítems, sin servidor)
node scripts/test-api.js          # prueba de humo REST/almacenamiento/deshacer      (26 ítems)
node scripts/test-gen.js          # cadena completa del motor de generación          (43 ítems, con la guía de ruta)
node scripts/test-pipeline.js     # flujo de serialización + exportación             (21 ítems)
node scripts/acceptance.js        # aceptación del flujo completo (equivalente a curl, 20 ítems)
node scripts/verify-ui.js         # renderizado real de 9 rutas con el kernel headless de Edge
```

Las tres suites de regresión del backend pueden ejecutarse sin configurar ninguna Key (se usa el motor de simulación integrado).

## Preguntas frecuentes

- **Informa de «puerto ya ocupado / EADDRINUSE»**: significa que ya hay un NovelForge en ejecución — basta con abrir http://127.0.0.1:7390; o usa `set NOVEL_PORT=7400` para cambiar de puerto e iniciar una segunda instancia; en Windows puedes terminar la instancia anterior con `netstat -ano | findstr :7390` + `taskkill /PID <PID> /F`.
- **Escribir directamente en cmd `NOVEL_PORT=7400 node server/index.js` da «no se reconoce como comando interno o externo»**: esa es la sintaxis de Linux/macOS; en el cmd de Windows usa `set NOVEL_PORT=7400` y después `node server/index.js` (o haz doble clic en `run.bat`, el puerto se reconoce automáticamente).
- **Quieres reiniciar con datos limpios**: detén el servicio y borra o mueve `data/`; al reiniciar quedará como nuevo (se reconstruye el ejemplo automáticamente).
- **Ollama local**: primero `ollama serve` y `ollama pull` el modelo; el preajuste del fabricante ya apunta a `http://127.0.0.1:11434/v1`.
- **Las salidas del motor de simulación llevan marcas evidentes**: es un aviso normal — al conectar un modelo real pasa a ser una creación formal.
- **¿No surten efecto los cambios de las plantillas de prompt?**: las plantillas se guardan combinadas por key en la configuración y los cambios surten efecto de inmediato; si se estropean, se pueden restablecer con un clic.

---

*NovelForge · MIT · feliz creación*
