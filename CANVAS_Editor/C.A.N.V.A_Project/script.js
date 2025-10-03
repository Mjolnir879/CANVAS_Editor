class MapEditor {
    constructor() {
        this.canvas = document.getElementById('map-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.tilesetPalette = document.getElementById('tileset-palette');
        this.collisionTiles = new Set(); // Armazena os IDs dos tiles que são colisores
        
        // Configurações do editor
        this.tileSize = 32;
        this.mapWidth = 40;
        this.mapHeight = 30;
        this.zoom = 1.0;
        this.selectedTile = null;
        this.isDrawing = false;
        this.mapData = [];
        this.lastMousePosition = null; // Para tracking do mouse
        this.isPanning = false; // Para controlar o pan com botão direito
        this.panStart = null; // Posição inicial do pan
        this.viewportTransform = {
            x: 0,    // Translação horizontal (pan)
            y: 0,    // Translação vertical (pan)
            scale: 1 // Nível de zoom
        };
        
        // Tileset
        this.tileset = null;
        this.tilesetColumns = 0;
        
        this.initializeCanvas();
        this.setupEventListeners();
        this.initializeMap();
        this.render();
    }

    initializeCanvas() {
        this.canvas.width = 800;
        this.canvas.height = 600;
    }

    initializeMap() {
        // Inicializa o mapa com zeros (tile vazio)
        this.mapData = [];
        for (let y = 0; y < this.mapHeight; y++) {
            this.mapData[y] = [];
            for (let x = 0; x < this.mapWidth; x++) {
                this.mapData[y][x] = 0; // 0 representa tile vazio
            }
        }
    }

    setupEventListeners() {
        // Prevenir menu de contexto no canvas
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        
        // Upload do tileset
        document.getElementById('upload-btn').addEventListener('click', () => {
            document.getElementById('tileset-upload').click();
        });

        document.getElementById('tileset-upload').addEventListener('change', (e) => {
            this.loadTileset(e.target.files[0]);
        });

        document.getElementById('tile-collision').addEventListener('change', (e) => {
            if (this.selectedTile) {
                if (e.target.checked) {
                    this.collisionTiles.add(this.selectedTile);
                } else {
                    this.collisionTiles.delete(this.selectedTile);
                }
            }
        });

        // Controles do canvas
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
        
        // Zoom
        document.getElementById('zoom-in').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoom-out').addEventListener('click', () => this.zoomOut());
        
        // Tamanho do tile
        document.getElementById('tile-size').addEventListener('change', (e) => {
            this.tileSize = parseInt(e.target.value);
            this.render();
        });

        // Exportar mapa
        document.getElementById('export-btn').addEventListener('click', () => this.exportMap());
        
        // Limpar mapa
        document.getElementById('clear-btn').addEventListener('click', () => this.clearMap());
    }

    loadTileset(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            this.tileset = new Image();
            this.tileset.onload = () => {
                this.tilesetColumns = Math.floor(this.tileset.width / this.tileSize);
                this.createTilesetPalette();
                this.render();
            };
            this.tileset.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    createTilesetPalette() {
        this.tilesetPalette.innerHTML = '';
        const tileCount = Math.floor(this.tileset.width / this.tileSize) * 
                         Math.floor(this.tileset.height / this.tileSize);

        for (let i = 0; i < tileCount; i++) {
            const tileCanvas = document.createElement('canvas');
            tileCanvas.width = this.tileSize;
            tileCanvas.height = this.tileSize;
            const tileCtx = tileCanvas.getContext('2d');

            const tileX = (i % this.tilesetColumns) * this.tileSize;
            const tileY = Math.floor(i / this.tilesetColumns) * this.tileSize;

            tileCtx.drawImage(
                this.tileset,
                tileX, tileY, this.tileSize, this.tileSize,
                0, 0, this.tileSize, this.tileSize
            );

            const tileWrapper = document.createElement('div');
            tileWrapper.className = 'tile-preview';
            tileWrapper.appendChild(tileCanvas);
            
            tileWrapper.addEventListener('click', () => {
                document.querySelectorAll('.tile-preview').forEach(t => t.classList.remove('selected'));
                tileWrapper.classList.add('selected');
                this.selectedTile = i + 1; // +1 porque 0 é tile vazio
                document.getElementById('selected-tile').textContent = i + 1;

                const collisionCheckbox = document.getElementById('tile-collision');
                collisionCheckbox.checked = this.collisionTiles.has(this.selectedTile);
            });

            this.tilesetPalette.appendChild(tileWrapper);
        }
    }

    handleMouseDown(e) {
        if (e.button === 2) { // Botão direito
            this.isPanning = true;
            this.panStart = {
                x: e.clientX - this.viewportTransform.x,
                y: e.clientY - this.viewportTransform.y
            };
            return;
        }
        
        if (!this.selectedTile) return;
        this.isDrawing = true;
        this.paintTile(e);
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        
        // Atualizar posição do mouse para preview
        this.lastMousePosition = {
            x: e.clientX - Math.round(rect.left),
            y: e.clientY - Math.round(rect.top)
        };
        
        // Lidar com pan (arrasto com botão direito)
        if (this.isPanning && this.panStart && e.buttons === 2) { // Verifica se botão direito ainda está pressionado
            this.viewportTransform.x = e.clientX - this.panStart.x;
            this.viewportTransform.y = e.clientY - this.panStart.y;
            this.render();
            return;
        } else if (this.isPanning) { // Se não está mais pressionando, para o pan
            this.isPanning = false;
            this.panStart = null;
        }
        
        // Lidar com pintura normal
        if (!this.isDrawing || !this.selectedTile) {
            this.render(); // Atualizar para mostrar preview
            return;
        }
        this.paintTile(e);
    }

    handleMouseUp(e) {
        if (e.button === 2) {
            // Congela a posição atual do viewport quando solta o botão direito
            this.isPanning = false;
            this.panStart = null;
            // Armazena a última posição válida do viewport
            this.viewportTransform.lastX = this.viewportTransform.x;
            this.viewportTransform.lastY = this.viewportTransform.y;
            return;
        }
        this.isDrawing = false;
    }

    paintTile(e) {
            const rect = this.canvas.getBoundingClientRect();
            
            // Ajustar para coordenadas relativas ao canvas com maior precisão
            const mouseX = e.clientX - Math.round(rect.left);
            const mouseY = e.clientY - Math.round(rect.top);
            
            // Ajustar coordenadas considerando o pan
            const adjustedX = mouseX - this.viewportTransform.x;
            const adjustedY = mouseY - this.viewportTransform.y;
            
            // Calcular posição exata na grade considerando zoom
            const tileSize = this.tileSize * this.zoom;
            const gridX = Math.floor(adjustedX / tileSize);
            const gridY = Math.floor(adjustedY / tileSize);
            
            if (gridX >= 0 && gridX < this.mapWidth && gridY >= 0 && gridY < this.mapHeight) {
                this.mapData[gridY][gridX] = this.selectedTile;
                this.render();
                document.getElementById('tile-position').textContent = `${gridX}, ${gridY}`;

            }
    }

    zoomIn() {
        this.zoom = Math.min(this.zoom + 0.25, 3.0);
        this.updateZoomDisplay();
        this.render();
    }
    
    zoomOut() {
        this.zoom = Math.max(this.zoom - 0.25, 0.5);
        this.updateZoomDisplay();
        this.render();
    }

    updateZoomDisplay() {
        document.getElementById('zoom-level').textContent = `${Math.round(this.zoom * 100)}%`;
    }

    render() {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Aplicar zoom e pan
        this.ctx.setTransform(
            this.zoom,
            0,
            0,
            this.zoom,
            this.viewportTransform.x,
            this.viewportTransform.y
        );
    
        // Limpa o canvas com cor de fundo
        this.ctx.fillStyle = '#1a252f';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
        // Desenha o grid
        this.drawGrid();
    
        // Desenha os tiles
        if (this.tileset) {
            this.drawTiles();
        }
    }

    drawGrid() {
        this.ctx.strokeStyle = '#34495e';
        this.ctx.lineWidth = 1;

        for (let x = 0; x <= this.mapWidth; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(x * this.tileSize * this.zoom, 0);
            this.ctx.lineTo(x * this.tileSize * this.zoom, this.mapHeight * this.tileSize * this.zoom);
            this.ctx.stroke();
        }

        for (let y = 0; y <= this.mapHeight; y++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y * this.tileSize * this.zoom);
            this.ctx.lineTo(this.mapWidth * this.tileSize * this.zoom, y * this.tileSize * this.zoom);
            this.ctx.stroke();
        }
    }

    drawTiles() {
        for (let y = 0; y < this.mapHeight; y++) {
            for (let x = 0; x < this.mapWidth; x++) {
                const tileId = this.mapData[y][x];
                if (tileId > 0) {
                    const tileIndex = tileId - 1;
                    const tileX = (tileIndex % this.tilesetColumns) * this.tileSize;
                    const tileY = Math.floor(tileIndex / this.tilesetColumns) * this.tileSize;

                    this.ctx.drawImage(
                        this.tileset,
                        tileX, tileY, this.tileSize, this.tileSize,
                        x * this.tileSize * this.zoom, y * this.tileSize * this.zoom,
                        this.tileSize * this.zoom, this.tileSize * this.zoom
                    );
                }
            }
        }

        // Desenhar preview do tile atual sob o cursor
        if (this.selectedTile && this.lastMousePosition) {
            const tileSize = this.tileSize * this.zoom;
            const gridX = Math.floor(this.lastMousePosition.x / tileSize);
            const gridY = Math.floor(this.lastMousePosition.y / tileSize);
            
            if (gridX >= 0 && gridX < this.mapWidth && gridY >= 0 && gridY < this.mapHeight) {
                // Desenhar retângulo semi-transparente
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                this.ctx.fillRect(
                    gridX * tileSize,
                    gridY * tileSize,
                    tileSize,
                    tileSize
                );
                
                // Desenhar borda
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(
                    gridX * tileSize,
                    gridY * tileSize,
                    tileSize,
                    tileSize
                );
            }
        }
    }

    exportMap() {
        const mapData = {
            tile_size: this.tileSize,
            width: this.mapWidth,
            height: this.mapHeight,
            tileset: document.getElementById('tileset-upload').files[0]?.name || 'tileset.png',
            collision_tiles: Array.from(this.collisionTiles), // Convertendo Set para Array
            layers: [
                {
                    name: "ground",
                    data: this.mapData
                }
            ]
        };

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(mapData, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", "map.json");
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        document.body.removeChild(downloadAnchor);
    }

    clearMap() {
        if (confirm('Tem certeza que deseja limpar o mapa?')) {
            this.initializeMap();
            this.render();
        }
    }
}

// Inicializa o editor quando a página carregar
document.addEventListener('DOMContentLoaded', () => {
    new MapEditor();
});