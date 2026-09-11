# Changelog

> **🌐 Idiomas**
> [简体中文](CHANGELOG.md) · [English](CHANGELOG.en.md) · [Français](CHANGELOG.fr.md) · [Русский](CHANGELOG.ru.md) · Español · [Português](CHANGELOG.pt.md)

Este changelog registra los cambios destacados de NovelForge siguiendo [Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y [Versionado Semántico](https://semver.org/).

> Nota de historial: las versiones anteriores a la v0.3.0 son los primeros lanzamientos formados (pipeline completo idea→mundo→personajes→esquema→prosa + pasarela multiproveedor + pipeline sin supervisión); el registro comienza en la v0.3.0.

## [0.4.1] - 2026-09-11

### Added
- **Etapa de ruta narrativa (planteamiento del esquema)**: nuevo paso de guía obligatorio entre el «planteamiento» y el «esquema», que evita que el esquema se disperse.
  - Nueva plantilla `t_route_plan` (ruta · ruta narrativa y planteamiento del esquema): produce 2~5 rutas candidatas realmente distintas entre sí; cada una incluye el planteamiento del esquema (estructura general / ritmo / punto de vista), la ruta por etapas (3~5 etapas, con el intervalo de capítulos y el giro al final de cada etapa), la vía de escalada del conflicto principal, la dirección del desenlace, los presagios transversales, los sacrificios y riesgos, y señala la opción recomendada por la IA.
  - Nueva acción `route_plan` (stage=idea); el proyecto incorpora el documento `routes` (`{candidates, selected}`), que puede leerse y escribirse en `/api/projects/:id/doc` con `pointer=routes`.
  - **Variable `{{routeText}}`**: `t_outline_generate` y `t_outline_extend` incorporan esta variable y declaran que «se debe seguir la ruta narrativa»;
    si ya hay una ruta seleccionada → se inyecta la ruta elegida por el usuario; si solo se generaron candidatas sin seleccionar → se inyecta la ruta recomendada por la IA marcada como «aún no confirmada por el usuario»; si no hay ninguna de las dos → se inyecta un recordatorio para ejecutar la guía.
- **Pipeline sin supervisión**: el modo `full` añade automáticamente un paso `route_plan` antes de generar el esquema, y el esquema toma como guía la ruta recomendada por la IA.
- **Exportación y listados**: el borrador `manuscript` incorpora el bloque «ruta narrativa y planteamiento del esquema» (el texto completo de la ruta seleccionada + las demás candidatas); la lista de proyectos devuelve el estado `route`; el estado del proyecto incorpora «ruta definida».
- **Interfaz web**: la página de ideas incorpora la acción «① ruta narrativa · planteamiento del esquema» y una tarjeta de rutas candidatas (seleccionar / adoptar la recomendación de la IA / generar otro lote); la página del esquema incorpora arriba un aviso de ruta (si no hay selección, recuerda ir antes a la guía).

### Changed
- El total de plantillas pasa de 24 → 25; el total de acciones del motor pasa de 18 → 19 (`route_plan`).
- `context.js` incorpora `fmtRoute / fmtRouteOne` y `buildVars` admite la opción `route`; la lista blanca de punteros de documento de `store.js` incluye `routes`.
- Versión 0.4.0 → 0.4.1.

### Verify
- Nueva prueba a nivel de módulo `scripts/test-route.js` (17/17): registro de la plantilla/acción, normalización de candidatas y semántica de guardado, los tres estados de inyección de `routeText` y renderizado sin marcadores de posición residuales.
- Autopruebas completas en verde: Motor 43/43 (incluidas 6 de la etapa de ruta) · API 26/26 · Pipeline 21/21 · Aceptación 20/20 · Renderizado 9/9 · Interacción 11/11 · Sintaxis 46/46 · Importación 15/15.
- `engine-mirror verify` de la imagen del espejo del motor: origen/plugins 32 frente a 32, cero divergencias.

## [0.4.0] - 2026-09-07

### Added
- **Registro de capacidades**: se añade `server/capabilities.js`, que expone `registerCapability / getCapability / listCapabilities`; el proyecto incorpora un nuevo campo `cap` (`novel/content/doc/email`), y las capacidades no novelísticas recurren al modelo de datos unificado del «taller de texto».
- **Capacidad de contenido (content)**: subir/pegar el texto original → analizar → imitar / continuar / reescribir. Se añaden las acciones `content_analyze / content_imitate / content_continue / content_rewrite`, con 4 plantillas correspondientes.
- **Capacidad de documento (doc)**: imitación de resoluciones del Consejo de Seguridad de la ONU. Se añade la acción `doc_resolution` y su plantilla de formato.
- **Capacidad de correo (email)**: redacción de correos académicos de contacto en frío. Se añaden la acción `email_cold` y su plantilla.
- **Escritura multilingüe**: campo `language` del proyecto + `langInstruction()`, que inyecta instrucciones de escritura según el idioma de destino (zh/en/fr/ru/es/pt y cualquier idioma).
- **API**: `GET /api/capabilities`, `GET /api/capabilities/:id`, `PUT /api/projects/:id/workspace` (escribir el texto fuente/parámetros/idioma); la creación de proyectos admite `cap`.
- **Marco de i18n del frontend**: `public/js/i18n.js` (diccionarios completos en chino/inglés + fallback al chino en francés/ruso/español/portugués), selector de idioma en la barra superior, y todas las vistas principales integradas con `t()`.
- **Taller de capacidades web**: `public/js/views/capStudio.js`, que ofrece una interfaz web de operación texto fuente → generación para proyectos content/doc/email.
- Se añaden 6 plantillas de capacidad nuevas (`t_content_*`, `t_doc_resolution`, `t_email_cold`).

### Changed
- **Actualización de posicionamiento**: de «taller de creación de novelas con IA» a un marco de «herramienta integral de creación con IA»; **la novela pasa a ser una de las capacidades (novel)** y se incorporan tres nuevos tipos de capacidades textuales.
- Los textos de la interfaz del frontend se integran plenamente con i18n (zh como base; los idiomas sin claves cubiertas recurren al chino).
- El número total de plantillas pasa de 18 → 24; el total de acciones del motor pasa de 18 → 24 (incluidas las acciones de capacidad).

### Fixed
- Se corrigen 3 errores de equilibrio de paréntesis expuestos en modo estricto ESM (`bible.js / audit.js / outline.js`), detectados previamente por `check-syntax.js` (análisis estricto .mjs) y no capturados por `node --check` (modo tolerante CJS).
- Se actualizan la imagen del espejo del motor y las aserciones de las pruebas para adaptarlas al nuevo número de capacidades.

### Verify
- Autopruebas de la versión independiente en verde: API 26/26 · Motor 35/35 · Pipeline 21/21 · Aceptación 20/20 · Sintaxis 45/45 · Importación 15/15.
- `engine-mirror verify` de la imagen del espejo del motor: origen/plugins 32 frente a 32, cero divergencias.

## [0.3.0] - 2026-09-06

### Added
- Primera versión oficial formada: el flujo completo idea → mundo(bible) → personajes → esquema por tomos y capítulos → cuerpo del capítulo, editable manualmente / regenerable / refinable por partes / deshacer con un clic.
- Pasarela LLM multiproveedor: OpenAI compatible / DeepSeek / Tongyi Qwen / Zhipu GLM / Kimi / iFlytek Spark / Doubao / SiliconFlow / Ollama / Grok / Gemini (incluye el motor de simulación offline mock, que permite recorrer todo el flujo sin Key).
- Pipeline sin supervisión (`pipeline.js`): completamente automático con un clic / del esquema al texto íntegro por entregas, con memoria de continuidad que archiva automáticamente por capítulo el resumen + hechos + presagios.
- Revisión de coherencia del texto completo (`audit_book`) y 4 formatos de exportación (md/manuscript/txt/json).
- Ejemplo integrado «Cartas de la Bahía de la Niebla» (雾港来信) y ajustes predefinidos de 12 proveedores, generados automáticamente en la primera ejecución.

### Fixed
- (La primera versión no registra defectos previos; esta versión es el punto de partida trazable.)

[0.4.1]: https://github.com/fengsheng-0617/novel-forge/releases/tag/v0.4.1
[0.4.0]: https://github.com/fengsheng-0617/novel-forge/releases/tag/v0.4.0
[0.3.0]: https://github.com/fengsheng-0617/novel-forge/releases/tag/v0.3.0
