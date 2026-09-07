# Changelog

> **🌐 Idiomas**
> [简体中文](CHANGELOG.md) · [English](CHANGELOG.en.md) · [Français](CHANGELOG.fr.md) · [Русский](CHANGELOG.ru.md) · Español · [Português](CHANGELOG.pt.md)

Este changelog registra los cambios destacados de NovelForge siguiendo [Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y [Versionado Semántico](https://semver.org/).

> Nota de historial: las versiones anteriores a la v0.3.0 son los primeros lanzamientos formados (pipeline completo idea→mundo→personajes→esquema→prosa + pasarela multiproveedor + pipeline sin supervisión); el registro comienza en la v0.3.0.

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

[0.4.0]: https://github.com/fengsheng-0617/novel-forge/releases/tag/v0.4.0
[0.3.0]: https://github.com/fengsheng-0617/novel-forge/releases/tag/v0.3.0
