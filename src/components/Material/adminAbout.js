// The About section of the admin screens: what IMS can do, how it's built and the user guide (moved here from
// Admin/AdminPanel.jsx when the admin screens were redesigned, 26 Oct 2026).
export const ADMIN_FEATURES = [
                         {
                           title: 'HNSW Vector Index Acceleration',
                           tag: 'AI & SEMANTIC SEARCH',
                           status: 'ACCELERATED',
                           color: '#06b6d4',
                           description: 'High-performance in-process Hierarchical Navigable Small World (HNSW) vector graph with sub-millisecond similarity lookups and real-time SSE progress streaming.',
                           bullets: [
                             'In-process C++ binding via hnswlib-node for 768-dimensional embeddings',
                             'Real-time SSE progress bar streaming file & vector counters',
                             'Automatic background HNSW graph compilation upon sync and document indexing',
                             'Auto disk persistence loading (hnsw_index.bin & hnsw_meta.json)',
                             'Sub-millisecond query lookups (~1.2ms) with linear search fallback'
                           ]
                         },
                         {
                           title: 'Gemini Live Multimodal Voice Engine',
                           tag: 'AUDIO & CONVERSATION',
                           status: 'LIVE STREAM',
                           color: '#a855f7',
                           description: 'Bidirectional real-time voice streaming with Gemini 3.1 Flash Live, hardware acoustic echo cancellation, and conversational tool calling.',
                           bullets: [
                             'Interactive Lock/Unlock toggle persisting voice choice across sessions',
                             'Robust 180ms jitter lead-time buffer preventing packet underrun pauses',
                             '30-second silence inactivity auto-close watchdog',
                             'extendKeepAlive tool for "hang on" / "wait a moment" pauses',
                             'Natural farewell auto-disconnect for "bye", "take it easy", "goodbye"'
                           ]
                         },
                         {
                           title: 'Port Status & Tunnel Probing Service',
                           tag: 'INFRASTRUCTURE',
                           status: 'OPERATIONAL',
                           color: '#10b981',
                           description: 'Server-side multi-service health checking endpoint at GET /api/port-status ensuring accurate diagnostics locally and over ngrok tunnels.',
                           bullets: [
                             'Vite portStatusPlugin probes ports 6001, 3001, 5173 server-side',
                             'Ngrok tunnel status monitored via agent API (localhost:4040)',
                             'Relative /api/port-status routing works transparently via tunnel',
                             'Proxy bypass rules preventing collision with port 3001 backend',
                             'SyncStatus.jsx polling telemetry indicator in dashboard bottom bar'
                           ]
                         },
                         {
                           title: '3D Spatial Knowledge Graph',
                           tag: 'VISUALISATION',
                           status: 'ACTIVE',
                           color: '#3b82f6',
                           description: '3D network mesh visualizing parent-child organizational hierarchy, secondary transverse links, and interactive entity nodes.',
                           bullets: [
                             'Three.js / React Three Fiber force-directed canvas',
                             'Entity-type coloured pill label borders with depth scaling',
                             'Curved outward-bowing transverse bezier connections',
                             'Top-right 2D minimap navigation control and scrub viewport',
                             'Floating toolbar with projection, layout, and appearance toggles'
                           ]
                         },
                         {
                           title: 'Hierarchical SVG Sunburst Visualisation',
                           tag: 'EXPLORATION',
                           status: 'ACTIVE',
                           color: '#f59e0b',
                           description: 'Interactive concentric nested radial SVG chart showcasing node hierarchy, clicked-based zoom/drill-down, and curved secondary transverse links.',
                           bullets: [
                             'Concentric ring layers (depth 0 to 4) representing entity-type hierarchies',
                             'Proportional sector angular sweep based on subtree weights',
                             'Click-to-zoom interactive drill-down focus pivoting',
                             'Hover glassmorphic metadata cards and title path tooltip popups',
                             'Flipped rotated text labels ensuring zero upside-down rendering'
                           ]
                         },
                         {
                           title: 'SharePoint Portal View',
                           tag: 'ENTERPRISE UI',
                           status: 'ACTIVE',
                           color: '#0284c7',
                           description: 'SharePoint Portal View for the Node Information Panel/Drawer with hierarchical navigation menus and child node inheritance.',
                           bullets: [
                             'Toggle control between Standard View and SharePoint Portal View',
                             'Dynamic deep-blue hierarchical navigation bar with multi-level dropdowns',
                             'Parent node title and node type badge indicators',
                             'Large prominent blue card depicting the node definition summary',
                             'Child node text area cards inheriting descending definitions'
                           ]
                         },
                         {
                           title: 'PDF Research Workspace & RAG',
                           tag: 'KNOWLEDGE BASE',
                           status: 'ACTIVE',
                           color: '#ef4444',
                           description: 'Split-screen document viewer integrating react-pdf for rendering reference sources side-by-side with chat or mesh graph.',
                           bullets: [
                             'Interactive citations opening specific PDF page targets',
                             'Synchronised page transitions with string integer parsing checks',
                             'Drag-resizable split-pane partition using the global layout resizer',
                             'Isolated topic and table of contents outline extraction'
                           ]
                         },
                         {
                           title: 'Topic Discovery & Session Vault',
                           tag: 'RESEARCH WORKSPACE',
                           status: 'ACTIVE',
                           color: '#8b5cf6',
                           description: 'Dedicated control panel managing research sessions, document library categorization and AI synthesis triggers.',
                           bullets: [
                             'Auto-generated session chat logs and conversation vault',
                             'Topic tag filtering and suggested prompts',
                             'Notebook clipboard for pinning references and drive file sync indicator',
                             'Individual and bulk session deletion with double confirmation safeguards'
                           ]
                         },
                         {
                           title: 'Simplified Demo Portal',
                           tag: 'ANALYTICS',
                           status: 'ACTIVE',
                           color: '#ec4899',
                           description: 'Simplified dashboard portal accessible via /demo route with node catalog overview and embedded Sunburst structure view.',
                           bullets: [
                             'Interactive Sankey Flow Chart mapping capability-to-region paths',
                             'Radial Dependency Wheel drawing neon chords between connected nodes',
                             'Centrality Analytics scatterplot plotting degree against frequency',
                             'Beta Views navigation dropdown providing access to experimental visualizations'
                           ]
                         },
                         {
                           title: 'Oatmeal Premium Theme Layout',
                           tag: 'DESIGN SYSTEM',
                           status: 'ACTIVE',
                           color: '#14b8a6',
                           description: 'Premium theme layout wrapping featuring glassmorphism, responsive sidebar layout with resize handles, and GBP regionalisation.',
                           bullets: [
                             'Interactive top header with model selection and cost telemetry',
                             'Dual-sidebar architecture with resize drag boundaries',
                             'Strict British English (en-GB) and GBP (£) regionalisation',
                             'Direct clipboard screenshot and image pasting support into chat prompt'
                           ]
                         }
                       ];

export const ADMIN_MODULES = [
                            { 
                              cat: 'Application Core', 
                              files: [
                                { n: 'App.jsx', d: 'The System Brain. Orchestrates state management, the radial layout engines, and viewport transitions.' },
                                { n: 'index.css', d: 'The Aesthetic Core. Defines design system tokens, glassmorphic effects, and motion physics.' },
                                { n: 'ThemeContext.jsx', d: 'Theme Provider. Persists user interface preferences and color identity across the component tree.' }
                              ] 
                            },
                            { 
                              cat: 'AI, Live Voice & Vector Acceleration', 
                              files: [
                                { n: 'hnswService.js', d: 'In-Process C++ HNSW Vector Graph Engine. Sub-millisecond similarity lookups (~1.2ms) across 41,000+ chunks.' },
                                { n: 'HnswIndexModal.jsx', d: 'Vector Acceleration Dashboard. Real-time Server-Sent Events (SSE) progress bar and index telemetry.' },
                                { n: 'useGeminiLive.js', d: 'Multimodal Live Voice Engine. Real-time bidirectional streaming, VAD anti-stutter, and farewell auto-disconnect.' },
                                { n: 'ChatInterface.jsx', d: 'Chat & Spoken Interaction UI. Includes voice choice locking, prompt actions, and topic synthesis.' }
                              ] 
                            },
                            { 
                              cat: 'Mesh & Canvas Renderers', 
                              files: [
                                { n: 'SunburstCanvas.jsx', d: 'The Sunburst Engine. Primary concentric nested radial layout canvas with custom arc masking.' },
                                { n: 'InstancedSpatialCanvas.jsx', d: 'The 3D Instanced Engine. High-performance GPU-instanced 3D force-directed canvas.' },
                                { n: 'SpatialCanvas.jsx', d: 'The 3D Standard Engine. Force-directed 3D canvas with full node labels and orbital controls.' },
                                { n: 'MeshCanvas.jsx', d: 'The 2D Engine. High-performance 2D canvas with physics-based nodes and lateral links.' },
                                { n: 'OrbitalNav.jsx', d: 'The Spatial Pilot. Implements HUD-based thumbstick controls and map-scale navigation.' }
                              ] 
                            },
                            { 
                              cat: 'Knowledge Intelligence & Infrastructure', 
                              files: [
                                { n: 'IntelligenceDrawer.jsx', d: 'The Knowledge Forge. Rich-text editor for node semantic metadata and hierarchical tagging.' },
                                { n: 'CatalogBrowser.jsx', d: 'Drive Library Explorer. Interactive document catalog and book subject categorization.' },
                                { n: 'SyncStatus.jsx', d: 'Port Health Telemetry. Server-side multi-port status probing and ngrok tunnel health bar.' },
                                { n: 'AdminPanel.jsx', d: 'Architectural Controller. Provides tools for hierarchy auditing, data sync, and system archival.' }
                              ] 
                            },
                            { 
                              cat: 'Data Fabric & Backend Services', 
                              files: [
                                { n: 'vectorStore.js', d: 'Vector Storage & Auto-Indexing Sync. Manages JSON vector files and HNSW invalidation/rebuild.' },
                                { n: 'driveService.js', d: 'Google Drive Sync Fabric. Handles PDF retrieval, background caching, and auto-categorization.' },
                                { n: 'mesh_authority.js', d: 'The Golden Source. Authoritative enterprise hierarchy definition in JavaScript format.' },
                                { n: 'nodes.js', d: 'Entity Blueprints. Defines internal schema and visual identity for all node types.' }
                              ] 
                            }
                          ];

export const ADMIN_GUIDE = [
                          { 
                            cat: 'The Map', 
                            items: [
                              { n: 'Smooth Motion', d: 'Panning and zooming feels natural and fluid, like a high-end map app.' },
                              { n: '8-Way Pilot', d: 'Fly through the map in any direction using your keyboard or the circular thumbstick.' },
                              { n: 'Auto-Centering', d: 'Stops you from wandering off into empty space by keeping items in view.' },
                              { n: 'Viewport Lock', d: 'Persists your camera position across sessions, ensuring you never lose your place.' }
                            ] 
                          },
                          { 
                            cat: 'The Tools', 
                            items: [
                              { n: 'Instant Backup', d: 'Saves a complete, secure snapshot of all files and folders to your computer in one click.' },
                              { n: 'Focus Mode', d: 'Dims and blurs unrelated items so you can focus on a specific node and its connections.' },
                              { n: 'Mini-map', d: 'A small preview window that lets you "scrub" across the entire enterprise structure.' },
                              { n: 'Structural Audit', d: 'Analyse the deep file architecture and system dependencies directly from the Admin Panel.' }
                            ] 
                          },
                          { 
                            cat: 'Knowledge', 
                            items: [
                              { n: 'Smart Link Tagging', d: 'Link nodes together instantly just by typing their name in brackets inside the description.' },
                              { n: 'Entity Promotion', d: 'Automatically turns regular text into interactive, clickable nodes with one tap.' },
                              { n: 'Connection Control', d: 'Turn relationship lines on or off directly from the text descriptions.' },
                              { n: 'Reparenting', d: 'Move entire branches of the hierarchy instantly using the Move icon.' }
                            ] 
                          },
                          { 
                            cat: 'Safety', 
                            items: [
                              { n: 'Waste Bin', d: 'Safely recover items you’ve deleted. Nothing is truly gone until you empty the bin.' },
                              { n: 'Hierarchy Audit', d: 'See at a glance where every node belongs in the hierarchy or transverse links.' },
                              { n: 'Live Auto-Save', d: 'Your changes are synced the moment you make them, protecting against crashes.' },
                              { n: 'Collision Elasticity', d: 'Radial layout engine that prevents node overlaps while allowing dense compaction.' }
                            ] 
                          }
                        ];
