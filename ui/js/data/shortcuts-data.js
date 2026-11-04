// --- PIPETA SHORTCUTS / HOTKEYS DATA & RENDERER ---
window.PIPETA_SHORTCUTS_SECTIONS = [
    {
        "id": "designers",
        "title": "📐 Shot Designer & Asset Designer (Canvas de Nodos)",
        "titleColor": "var(--accent)",
        "keyColumnHeader": "Atajo / Acción",
        "descColumnHeader": "Descripción y Comportamiento",
        "rows": [
            {
                "keys": [
                    {
                        "label": "Ctrl + Z",
                        "color": "#ffca28"
                    }
                ],
                "description": "<b>Deshacer (Undo):</b> Revierte la última acción (mover, agregar, borrar, modificar)"
            },
            {
                "keys": [
                    {
                        "label": "Ctrl + Y",
                        "color": "#ffca28"
                    },
                    {
                        "label": "Ctrl + Shift + Z",
                        "color": "#ffca28"
                    }
                ],
                "sep": " / ",
                "description": "<b>Rehacer (Redo):</b> Restaura la última acción deshecha"
            },
            {
                "keys": [
                    {
                        "label": "Ctrl + D",
                        "color": "#4fc3f7"
                    }
                ],
                "description": "Duplicar nodo(s) seleccionado(s) manteniendo conexiones relativas"
            },
            {
                "keys": [
                    {
                        "label": "Ctrl + C",
                        "color": "#4fc3f7"
                    }
                ],
                "description": "Copiar nodo(s) seleccionado(s) al portapapeles del diseñador"
            },
            {
                "keys": [
                    {
                        "label": "Ctrl + V",
                        "color": "#4fc3f7"
                    }
                ],
                "description": "Pegar nodo(s) copiados con desplazamiento automático en el canvas"
            },
            {
                "keys": [
                    {
                        "label": "Ctrl + Shift + C",
                        "color": "#ba68c8"
                    }
                ],
                "description": "<b>Copiar Configuración:</b> Copia todos los atributos y configuraciones del nodo seleccionado"
            },
            {
                "keys": [
                    {
                        "label": "Ctrl + Shift + V",
                        "color": "#ba68c8"
                    }
                ],
                "description": "<b>Pegar Configuración:</b> Aplica las configuraciones copiadas manteniendo el nombre y ejemplo del nodo destino"
            },
            {
                "keys": [
                    {
                        "label": "Doble Clic",
                        "color": "#81c784"
                    },
                    {
                        "label": "Enter",
                        "color": "#81c784"
                    }
                ],
                "sep": " o ",
                "description": "Renombrar nodo directamente en el canvas (inline, sin ventanas)"
            },
            {
                "keys": [
                    {
                        "label": "Supr",
                        "color": "#f06292"
                    },
                    {
                        "label": "Backspace",
                        "color": "#f06292"
                    }
                ],
                "sep": " / ",
                "description": "Borrar nodo(s) seleccionado(s) del preset"
            },
            {
                "keys": [
                    {
                        "label": "Shift + Clic",
                        "color": "#ffb74d"
                    },
                    {
                        "label": "Ctrl + Clic",
                        "color": "#ffb74d"
                    }
                ],
                "sep": " / ",
                "description": "Selección múltiple o deselección individual de nodos"
            },
            {
                "keys": [
                    {
                        "label": "Arrastrar Nodo",
                        "color": "#bbb"
                    }
                ],
                "description": "Mueve todos los nodos seleccionados en bloque manteniendo distancias"
            },
            {
                "keys": [
                    {
                        "label": "Rueda del Ratón",
                        "color": "#bbb"
                    }
                ],
                "description": "Zoom In / Zoom Out fluido en el canvas"
            },
            {
                "keys": [
                    {
                        "label": "Espacio + Arrastrar",
                        "color": "#bbb"
                    }
                ],
                "description": "Desplazamiento / Panning por el canvas"
            },
            {
                "keys": [
                    {
                        "label": "Escape",
                        "color": "#bbb"
                    }
                ],
                "description": "Cancelar edición de nombre inline / deseleccionar nodos"
            }
        ]
    },
    {
        "id": "explorer_ia",
        "title": "🗂️ Explorer, Navegación & IA Ingest",
        "titleColor": "#4fc3f7",
        "keyColumnHeader": "Atajo",
        "descColumnHeader": "Módulo / Descripción",
        "rows": [
            {
                "keys": [
                    {
                        "label": "Ctrl + C",
                        "color": "#4fc3f7"
                    },
                    {
                        "label": "Ctrl + V",
                        "color": "#4fc3f7"
                    }
                ],
                "sep": " / ",
                "description": "<b>Explorer:</b> Copiar y pegar archivos o carpetas seleccionadas"
            },
            {
                "keys": [
                    {
                        "label": "Ctrl + V",
                        "color": "#4fc3f7"
                    }
                ],
                "description": "<b>IA Ingest:</b> Pegar imagen capturada desde el portapapeles de Windows"
            },
            {
                "keys": [
                    {
                        "label": "F5",
                        "color": "#bbb"
                    },
                    {
                        "label": "Ctrl + R",
                        "color": "#bbb"
                    }
                ],
                "sep": " / ",
                "description": "Recargar vista y estado de la aplicación"
            }
        ]
    }
];

window.renderPipetaShortcutsHtml = function () {
    const sections = Array.isArray(window.PIPETA_SHORTCUTS_SECTIONS) ? window.PIPETA_SHORTCUTS_SECTIONS : [];

    const sectionsHtml = sections.map((sec) => {
        const rowsHtml = (sec.rows || []).map((row, idx, arr) => {
            const isLast = idx === arr.length - 1;
            const sep = row.sep || ' / ';
            const keysHtml = (row.keys || []).map(k =>
                `<kbd style="background:#222; border:1px solid #555; padding:2px 6px; border-radius:3px; color:${k.color || '#bbb'}; font-weight:bold;">${k.label}</kbd>`
            ).join(sep);

            return `
                                    <tr${isLast ? '' : ' style="border-bottom:1px solid #2a2a2a;"'}>
                                        <td style="padding:8px 10px;">${keysHtml}</td>
                                        <td style="padding:8px 10px; color:#ccc;">${row.description}</td>
                                    </tr>`;
        }).join('');

        return `
                        <div style="background:rgba(255,255,255,0.03); padding:15px; border-radius:8px; border:1px solid #333;">
                            <div style="font-weight:bold; color:${sec.titleColor || 'var(--accent)'}; margin-bottom:12px; font-size:0.95rem;">
                                ${sec.title}
                            </div>
                            <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                                <thead>
                                    <tr style="border-bottom:1px solid #444; color:#aaa; text-align:left;">
                                        <th style="padding:6px 10px; width:230px;">${sec.keyColumnHeader || 'Atajo'}</th>
                                        <th style="padding:6px 10px;">${sec.descColumnHeader || 'Descripción'}</th>
                                    </tr>
                                </thead>
                                <tbody>${rowsHtml}
                                </tbody>
                            </table>
                        </div>`;
    }).join('\n');

    return `
                    <h3 style="margin-top:0; border-bottom:1px solid #333; padding-bottom:10px; display:flex; align-items:center; gap:8px;">
                        <span>⌨️ Asignaciones de Teclas & Atajos (Hotkeys)</span>
                    </h3>
                    <p style="color:#888; margin-bottom:20px; font-size:0.9rem;">
                        Referencia de atajos de teclado y acciones rápidas disponibles en cada módulo de Pipeta.
                    </p>

                    <div style="display:flex; flex-direction:column; gap:20px;">
${sectionsHtml}
                    </div>
    `;
};
