// Глобальные переменные
        var map;
        var referencePoint = null;
        var addedPoints = [];
        var addMode = true;
        var yandexApiKey = null;
        
        var DEFAULT_COORDS = [55.751244, 37.618423];
        var DEFAULT_ZOOM = 10;
        
        // === Вспомогательные функции ===
        function getUrlParams() {
            var urlParams = new URLSearchParams(window.location.search);
            var dataParam = urlParams.get('data');
            
            if (!dataParam) return null;
            
            try {
                return JSON.parse(decodeURIComponent(dataParam));
            } catch (e) {
                showStatus('Ошибка парсинга данных', true);
                return null;
            }
        }
        
        function showStatus(message, isError) {
            var bar = document.getElementById('statusBar');
            bar.innerHTML = (isError ? '❌ ' : 'ℹ️ ') + message;
            bar.style.color = isError ? '#c62828' : '#666';
            
            setTimeout(function() {
                bar.innerHTML = '🗺️ Карта готова';
                bar.style.color = '#666';
            }, 3000);
        }
        
        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(function() {
                showStatus('✅ Координаты скопированы', false);
            });
        }
        
        // === Загрузка API ===
        function loadYandexApi(apiKey) {
            yandexApiKey = apiKey;
            var script = document.createElement('script');
            script.src = 'https://api-maps.yandex.ru/2.1/?apikey=' + apiKey + '&lang=ru_RU';
            script.onload = function() { ymaps.ready(initMap); };
            script.onerror = function() { showStatus('Ошибка загрузки API', true); };
            document.head.appendChild(script);
        }

        // === Хранилище для зелёных зон ===
        var greenZoneObjects = [];
        var greenZonesVisible = true;

        // === Загрузка зон из GeoJSON ===
        function loadZonesFromGeoJSON(url, color, strokePanel) {
            console.log('🔄 Загружаю зоны из:', url);
            
            fetch(url)
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error('HTTP ошибка: ' + response.status);
                    }
                    return response.json();
                })
                .then(function(data) {
                    console.log('📦 Файл загружен, зон:', data.features.length);
                    
                    for (var i = 0; i < data.features.length; i++) {
                        var feature = data.features[i];
                        
                        if (feature.geometry.type === 'Polygon' && feature.geometry.coordinates[0].length > 0) {
                            var coords = feature.geometry.coordinates[0];
                            var fixedCoords = [];
                            
                            for (var j = 0; j < coords.length; j++) {
                                fixedCoords.push([coords[j][1], coords[j][0]]);
                            }
                            
                            // Дырки
                            var holes = [];
                            if (feature.geometry.coordinates.length > 1) {
                                for (var h = 1; h < feature.geometry.coordinates.length; h++) {
                                    var holeCoords = feature.geometry.coordinates[h];
                                    if (holeCoords.length > 0) {
                                        var fixedHole = [];
                                        for (var k = 0; k < holeCoords.length; k++) {
                                            fixedHole.push([holeCoords[k][1], holeCoords[k][0]]);
                                        }
                                        holes.push(fixedHole);
                                    }
                                }
                            }
                            
                            var allCoords = [fixedCoords].concat(holes);
                            
                            var polygon = new ymaps.Polygon(
                                allCoords,
                                {},
                                {
                                    fillColor: color,
                                    strokeColor: strokePanel,
                                    strokeWidth: 3,
                                    fillOpacity: 0.4,
                                    hasBalloon: false,
                                    hasHint: false,
                                    interactive: false,
                                    visible: true
                                }
                            );
                            
                            map.geoObjects.add(polygon);
                            // ✅ Сохраняем в массив для кнопки включения/выключения
                            if (color === '#a4d6c7' || color === '#1bad03') {
                                greenZoneObjects.push(polygon);
                            }
                            
                        }
                    }
                    
                    console.log('✅ Зоны добавлены. Объектов на карте:', map.geoObjects.getLength());
                    if (color === '#56db40' || color === '#4CAF50') {
                        console.log('🟢 Зелёных зон в массиве:', greenZoneObjects.length);
                    }
                })
                .catch(function(error) {
                    console.log('❌ Ошибка:', error.message);
                });
        }

        // === Переключение видимости зелёных зон ===
        function toggleGreenZones() {
            greenZonesVisible = !greenZonesVisible;
            
            for (var i = 0; i < greenZoneObjects.length; i++) {
                greenZoneObjects[i].options.set('visible', greenZonesVisible);
            }
            
            var btn = document.getElementById('toggleZonesBtn');
            
            if (greenZonesVisible) {
                btn.innerHTML = '🟢 Зелёные зоны: ВКЛ';
                btn.className = 'control-btn btn-primary';
                btn.style.background = '#4CAF50';
                showStatus('Зелёные зоны включены', false);
            } else {
                btn.innerHTML = '🔘 Зелёные зоны: ВЫКЛ';
                btn.className = 'control-btn btn-warning';
                btn.style.background = '#9e9e9e';
                showStatus('Зелёные зоны скрыты', false);
            }
        }
        
        // === Инициализация карты ===
        function initMap() {
            var params = getUrlParams();
            var centerCoords = DEFAULT_COORDS;
            var zoom = DEFAULT_ZOOM;
            var hasTower = false;
            
            if (params && params[0]) {
                var data = params[0];
                centerCoords = data.coords || DEFAULT_COORDS;
                zoom = 14;
                hasTower = true;
                
                referencePoint = {
                    coords: centerCoords,
                    radius: data.radius || 100,
                    mcc: data.mcc || '—',
                    mnc: data.mnc || '—',
                    lac: data.lac || '—',
                    cellid: data.cellid || '—',
                    isTower: true
                };
            } else {
                referencePoint = {
                    coords: DEFAULT_COORDS,
                    radius: 0,
                    mcc: '—',
                    mnc: '—',
                    lac: '—',
                    cellid: '—',
                    isTower: false
                };
            }
            
            updateTowerCard();
            
            map = new ymaps.Map("map", {
                center: centerCoords,
                zoom: zoom,
                controls: ['zoomControl', 'fullscreenControl', 'typeSelector']
            });
            
            if (hasTower) {
                addTowerToMap();
            } else {
                addReferenceMarker();
            }

            // ✅ Загружаем зелёные зоны
            loadZonesFromGeoJSON('geojson/MSK_23.04.2026.geojson', '#a4d6c7' , '#1bad03');
            loadZonesFromGeoJSON('geojson/KRD_23.04.2026.geojson', '#a4d6c7' , '#1bad03');
            loadZonesFromGeoJSON('geojson/SCH_24.04.2026.geojson', '#a4d6c7' , '#1bad03');
            loadZonesFromGeoJSON('geojson/SPB_23.04.2026.geojson', '#a4d6c7' , '#1bad03');
            loadZonesFromGeoJSON('geojson/PENALTY.geojson', '#202022', '#373739');
            
            map.events.add('click', function(e) {
                if (addMode) addPoint(e.get('coords'));
            });

            // === Обработчик правого клика — копирование координат ===
            map.events.add('contextmenu', function(e) {
                e.preventDefault();
                
                var coords = e.get('coords');
                var lat = coords[0].toFixed(6);
                var lon = coords[1].toFixed(6);
                var coordText = lat + ', ' + lon;
                
                // Получаем координаты мыши через глобальный объект события
                var globalEvent = e.get('domEvent').originalEvent;
                var mouseX = globalEvent.clientX;
                var mouseY = globalEvent.clientY;
                
                // Создаём всплывающую подсказку
                var tooltip = document.createElement('div');
                tooltip.className = 'copy-tooltip';
                tooltip.textContent = '📋 ' + coordText;
                tooltip.style.left = mouseX + 'px';
                tooltip.style.top = (mouseY - 50) + 'px';
                
                document.body.appendChild(tooltip);
                
                // Анимация появления
                setTimeout(function() {
                    tooltip.style.opacity = '1';
                    tooltip.style.transform = 'translate(-50%, -10px)';
                }, 10);
                
                // Удаляем через 0,5 секунды
                setTimeout(function() {
                    tooltip.style.opacity = '0';
                    tooltip.style.transform = 'translate(-50%, -25px)';
                    setTimeout(function() {
                        if (tooltip.parentNode) {
                            document.body.removeChild(tooltip);
                        }
                    }, 300);
                }, 500);
                
                // Копируем в буфер обмена
                navigator.clipboard.writeText(coordText).catch(function() {
                    var textarea = document.createElement('textarea');
                    textarea.value = coordText;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                });
            });          

            setTimeout(function() {
            updateToggleButtonHeight();
            }, 200);
        }
        
        // === Обновление карточки вышки ===
        function updateTowerCard() {
            if (!referencePoint) return;
            
            var coords = referencePoint.coords;
            var coordStr = coords[0].toFixed(6) + ', ' + coords[1].toFixed(6);
            
            var html = '';
            
            if (referencePoint.isTower) {
                html = '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">' +
                       '<div style="width: 12px; height: 12px; background: #ff0000; border-radius: 50%;"></div>' +
                       '<span style="font-weight: bold;">Вышка сотовой связи</span>' +
                       '</div>';
                
                if (referencePoint.radius) {
                    html += '<div style="font-size: 12px; color: #666; margin-bottom: 5px;">' +
                            'Радиус точности: ' + referencePoint.radius + ' м</div>';
                }
            } else {
                html = '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">' +
                       '<div style="width: 12px; height: 12px; background: #4CAF50; border-radius: 50%;"></div>' +
                       '<span style="font-weight: bold;">Свободный режим</span>' +
                       '</div>';
            }
            
            html += '<div class="tower-coords">' +
                    '<span class="coords-text" onclick="copyToClipboard(\'' + coordStr + '\')">' +
                    '📍 ' + coordStr + '</span>' +
                    '<button class="copy-btn" onclick="copyToClipboard(\'' + coordStr + '\')">📋 Копировать</button>' +
                    '</div>';
            
            document.getElementById('towerInfo').innerHTML = html;
        }
        
        // === Добавление вышки на карту ===
        function addTowerToMap() {
            var coords = referencePoint.coords;
            
            // Круг точности — делаем его некликабельным
            var circle = new ymaps.Circle(
                [coords, referencePoint.radius],
                {},
                { 
                    fillColor: "#FF000033", 
                    strokeColor: "#FF0000", 
                    strokeWidth: 2,
                    interactive: false  // ✅ Круг больше не перехватывает клики
                }
            );
            
            // Круглая метка
            var placemark = new ymaps.Placemark(
                coords,
                {
                    balloonContentHeader: "📡 Вышка сотовой связи",
                    balloonContentBody: 
                        '<b>Координаты:</b><br>' +
                        coords[0].toFixed(6) + ', ' + coords[1].toFixed(6) + '<br>' +
                        '<b>Радиус точности:</b> ' + referencePoint.radius + ' м',
                    hintContent: "Вышка"
                },
                {
                    preset: 'islands#redCircleIcon',
                    iconColor: '#ff0000'
                }
            );
            
            map.geoObjects.add(circle);
            map.geoObjects.add(placemark);
        }
        
        // === Метка в свободном режиме ===
        function addReferenceMarker() {
            var coords = referencePoint.coords;
            
            var placemark = new ymaps.Placemark(
                coords,
                {
                    balloonContentHeader: "📍 Точка отсчёта",
                    balloonContentBody: '<b>Координаты:</b><br>' + coords[0].toFixed(6) + ', ' + coords[1].toFixed(6),
                    hintContent: "Точка отсчёта"
                },
                {
                    preset: 'islands#greenCircleIcon',
                    iconColor: '#4CAF50'
                }
            );
            
            map.geoObjects.add(placemark);
        }
        
        // === Расстояние между точками ===
        function getDistance(coord1, coord2) {
            var lat1 = coord1[0], lon1 = coord1[1];
            var lat2 = coord2[0], lon2 = coord2[1];
            
            var R = 6371000;
            var dLat = (lat2 - lat1) * Math.PI / 180;
            var dLon = (lon2 - lon1) * Math.PI / 180;
            var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLon/2) * Math.sin(dLon/2);
            var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return Math.round(R * c);
        }
        
        // === Добавление точки ===
        function addPoint(coords, skipStatus) {
            if (!referencePoint) return;
            
            var pointId = Date.now() + Math.random();
            var distance = getDistance(referencePoint.coords, coords);
            
            var pointData = {
                id: pointId,
                coords: coords,
                distance: distance
            };
            
            var placemark = new ymaps.Placemark(
                coords,
                {
                    balloonContentHeader: "📍 Точка #" + (addedPoints.length + 1),
                    balloonContentBody: 
                        '<b>Координаты:</b><br>' +
                        coords[0].toFixed(6) + ', ' + coords[1].toFixed(6) + '<br>' +
                        '<b>Расстояние:</b> ' + distance + ' м',
                    hintContent: "Точка " + (addedPoints.length + 1)
                },
                {
                    preset: 'islands#blueCircleIcon',
                    iconColor: '#2196F3'
                }
            );
            
            pointData.placemark = placemark;
            addedPoints.push(pointData);
            map.geoObjects.add(placemark);
            
            updatePointsList();
            if (!skipStatus) showStatus('Точка #' + addedPoints.length + ' добавлена', false);
        }
        
        // === Добавление по координатам из поля ввода ===
        function addPointByCoords() {
            var input = document.getElementById('coordInput');
            var value = input.value.trim();
            
            if (!value) {
                showStatus('Введите координаты', true);
                return;
            }
            
            var lat, lon;
            
            // Очищаем строку: заменяем переносы строк на пробелы, убираем лишние пробелы
            var cleanValue = value.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
            
            // Пробуем разные форматы
            
            // Формат 1: "59.929623, 30.427795" (запятая)
            if (cleanValue.includes(',')) {
                var parts = cleanValue.split(',').map(function(p) { 
                    return parseFloat(p.trim()); 
                });
                if (parts.length >= 2) {
                    lat = parts[0];
                    lon = parts[1];
                }
            } 
            // Формат 2: "59.929623 30.427795" (пробел)
            else if (cleanValue.includes(' ')) {
                var parts = cleanValue.split(' ').map(function(p) { 
                    return parseFloat(p.trim()); 
                });
                // Фильтруем NaN значения
                parts = parts.filter(function(p) { return !isNaN(p); });
                if (parts.length >= 2) {
                    lat = parts[0];
                    lon = parts[1];
                }
            }
            // Формат 3: просто одно число? (не подходит)
            else {
                showStatus('Введите две координаты через запятую или пробел', true);
                return;
            }
            
            // Проверяем, что координаты распарсились
            if (isNaN(lat) || isNaN(lon)) {
                showStatus('Неверный формат координат', true);
                return;
            }
            
            // Проверка диапазона
            if (lat < -90 || lat > 90) {
                showStatus('Широта должна быть от -90 до 90', true);
                return;
            }
            
            if (lon < -180 || lon > 180) {
                showStatus('Долгота должна быть от -180 до 180', true);
                return;
            }
            
            // Добавляем точку
            addPoint([lat, lon]);
            map.setCenter([lat, lon], 15);
            input.value = '';
            showStatus('✅ Точка добавлена: ' + lat.toFixed(6) + ', ' + lon.toFixed(6), false);
        }

        // === Сворачивание/разворачивание панели ===
        function togglePanel() {
            // Ищем элементы прямо в момент клика
            var panel = document.getElementById('leftPanel');
            var btn = document.getElementById('togglePanelBtn');
            
            // Если не нашли — пробуем ещё раз через небольшую задержку
            if (!panel || !btn) {
                console.log('Элементы не найдены, пробуем ещё раз...');
                setTimeout(function() {
                    panel = document.getElementById('leftPanel');
                    btn = document.getElementById('togglePanelBtn');
                    
                    if (!panel || !btn) {
                        console.log('Элементы всё ещё не найдены. Проверь HTML.');
                        return;
                    }
                    
                    togglePanelAction(panel, btn);
                }, 100);
                return;
            }
            
            togglePanelAction(panel, btn);
        }
        
        // === Действие сворачивания ===
        function togglePanelAction(panel, btn) {
            var isCollapsed = panel.classList.contains('collapsed');
            
            if (isCollapsed) {
                // Разворачиваем
                panel.classList.remove('collapsed');
                btn.classList.remove('panel-hidden');
                btn.style.left = '330px';
                btn.title = 'Свернуть панель';
            } else {
                // Сворачиваем
                panel.classList.add('collapsed');
                btn.classList.add('panel-hidden');
                btn.style.left = '10px';
                btn.title = 'Развернуть панель';
            }
        }

                // === Обновление высоты кнопки сворачивания ===
        function updateToggleButtonHeight() {
            var panel = document.getElementById('leftPanel');
            var btn = document.getElementById('togglePanelBtn');
            
            if (panel && btn) {
                var panelHeight = panel.offsetHeight;
                btn.style.height = panelHeight + 'px';
            }
        }
        
        // Обновляем позицию кнопки при изменении размеров окна
        window.addEventListener('resize', function() {
            var panel = document.getElementById('leftPanel');
            var btn = document.getElementById('togglePanelBtn');
            
            if (panel.classList.contains('collapsed')) {
                btn.style.left = '10px';
            } else {
                btn.style.left = '290px';
            }
        });
        
        // === Обновление списка точек ===
        function updatePointsList() {
            var container = document.getElementById('pointsContainer');
            var countSpan = document.getElementById('pointCount');
            
            countSpan.textContent = addedPoints.length;
            
            if (addedPoints.length === 0) {
                container.innerHTML = '<div class="empty-message">Нет добавленных точек</div>';
                return;
            }
            
            var html = '';
            for (var i = 0; i < addedPoints.length; i++) {
                var point = addedPoints[i];
                var num = i + 1;
                var coordStr = point.coords[0].toFixed(6) + ', ' + point.coords[1].toFixed(6);
                
                html += '<div class="point-item" onclick="focusOnPoint(' + point.id + ')">' +
                        '<div style="flex: 1;">' +
                        '<b>#' + num + '</b> ' +
                        '<span class="point-coords">' + coordStr + '</span>' +
                        '</div>' +
                        '<div style="display: flex; align-items: center; gap: 6px;">' +
                        '<span class="point-distance">' + point.distance + ' м</span>' +
                        '<div class="point-actions">' +
                        '<button class="icon-btn" onclick="event.stopPropagation(); copyToClipboard(\'' + coordStr + '\')" title="Копировать">📋</button>' +
                        '<button class="icon-btn" onclick="event.stopPropagation(); removePoint(' + point.id + ')" title="Удалить">✖</button>' +
                        '</div>' +
                        '</div>' +
                        '</div>';
            }
            
            container.innerHTML = html;
        }
        
        // === Фокус на точке ===
        function focusOnPoint(pointId) {
            for (var i = 0; i < addedPoints.length; i++) {
                if (addedPoints[i].id === pointId) {
                    map.setCenter(addedPoints[i].coords, 16);
                    addedPoints[i].placemark.balloon.open();
                    break;
                }
            }
        }
        
        // === Удаление конкретной точки ===
        function removePoint(pointId) {
            for (var i = 0; i < addedPoints.length; i++) {
                if (addedPoints[i].id === pointId) {
                    map.geoObjects.remove(addedPoints[i].placemark);
                    addedPoints.splice(i, 1);
                    updatePointsList();
                    showStatus('Точка удалена', false);
                    break;
                }
            }
        }
        
        // === Очистка всех точек ===
        function clearAllPoints() {
            if (addedPoints.length === 0) return;
            
            if (confirm('Удалить все добавленные точки?')) {
                for (var i = 0; i < addedPoints.length; i++) {
                    map.geoObjects.remove(addedPoints[i].placemark);
                }
                addedPoints = [];
                updatePointsList();
                showStatus('Все точки удалены', false);
            }
        }
        
        // === Переключение режима добавления ===
        function toggleAddMode() {
            addMode = !addMode;
            var btn = document.getElementById('modeBtn');
            
            if (addMode) {
                btn.innerHTML = '✏️ Добавление точек: ВКЛ';
                btn.className = 'control-btn btn-info';
                showStatus('Клик по карте добавляет точку', false);
            } else {
                btn.innerHTML = '🔒 Добавление точек: ВЫКЛ';
                btn.className = 'control-btn btn-yandex';
                showStatus('Добавление по клику отключено', false);
            }
        }
        
        // === Открытие в Яндекс.Картах с сохранением положения камеры ===
        function openInYandexMaps() {
            if (!map) return;
            
            // Получаем текущий центр карты
            var center = map.getCenter();
            var lat = center[0];
            var lon = center[1];
            
            // Получаем текущий зум
            var zoom = map.getZoom();
            
            // Собираем все точки для меток
            var allPoints = [];
            
            // Добавляем точку отсчёта (вышку или центр)
            if (referencePoint) {
                allPoints.push(referencePoint.coords);
            }
            
            // Добавляем все пользовательские точки
            for (var i = 0; i < addedPoints.length; i++) {
                allPoints.push(addedPoints[i].coords);
            }
            
            // Формируем URL
            var ll = lon.toFixed(6) + ',' + lat.toFixed(6);
            var url = 'https://yandex.ru/maps/?ll=' + ll + '&z=' + zoom;
            
            // Добавляем метки
            if (allPoints.length > 0) {
                var ptParams = [];
                for (var i = 0; i < allPoints.length; i++) {
                    var p = allPoints[i];
                    ptParams.push(p[1].toFixed(6) + ',' + p[0].toFixed(6));
                }
                url += '&pt=' + ptParams.join('~');
            }
            
            window.open(url, '_blank');
            showStatus('Открыто в Яндекс.Картах (зум: ' + zoom + ')', false);
        }
        
        // === Запуск ===
        (function startup() {
            var urlParams = new URLSearchParams(window.location.search);
            var apiKey = urlParams.get('apikey');
            
            if (!apiKey) {
                document.getElementById('statusBar').innerHTML = '❌ API-ключ не передан';
                return;
            }
            
            loadYandexApi(apiKey);
        })();

        // Обновление позиции кнопки при изменении размеров окна
        window.addEventListener('resize', function() {
            var panel = document.getElementById('leftPanel');
            var btn = document.getElementById('togglePanelBtn');
            
            updateToggleButtonHeight();
            
            if (panel && btn) {
                if (panel.classList.contains('collapsed')) {
                    btn.style.left = '10px';
                } else {
                    btn.style.left = '300px';
                }
            }
        });