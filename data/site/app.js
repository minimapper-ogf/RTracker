const state = {
    games: null,
    groups: null,
    indexSort: { key: 'v', dir: -1 },
    searchQuery: '',
    indexTab: 'games',
    activeTab: 'trends',
    currentCharts: [],
    addType: null,
    addId: '',
    addPreview: null,
    addError: null,
    addStatus: 'idle',
    currentPage: 1
};
const colors = ['#5f9cff', '#56d0a3', '#ff9f5e', '#ff6b88'];
const app = document.getElementById('app');
let chartCounter = 0;

function getChartId(prefix) {
    chartCounter += 1;
    return `${prefix}-${chartCounter}`;
}

function roundToNice(value) {
    if (value <= 0) return 0;
    const exponent = Math.floor(Math.log10(value));
    const base = Math.pow(10, exponent);
    const rounded = Math.ceil(value / base) * base;
    const fallback = Math.ceil(value / (base / 2)) * (base / 2);
    return rounded || fallback;
}

function drawCharts(charts) {
    if (!window.Highcharts || !charts?.length) return;
    charts.forEach(chart => {
        const yAxis = Array.isArray(chart.yAxis) ? [...chart.yAxis] : [{
            labels: { style: { color: '#dbe5ff' } },
            title: { text: null },
            gridLineColor: 'rgba(255,255,255,0.08)'
        }];
        const columnSeries = chart.series.filter(series => series.type === 'column');
        if (columnSeries.length) {
            const barValues = columnSeries.flatMap(series => {
                const values = series.data ?? series.values ?? [];
                return values
                .map(point => Array.isArray(point) ? point[1] : point)
                .filter(v => typeof v === 'number');
            });
            if (barValues.length) {
                const maxBar = Math.max(...barValues);
                const targetMax = roundToNice(maxBar * 3);
                if (yAxis[1]) {
                    yAxis[1] = { ...yAxis[1], max: targetMax };
                }
            }
        }
        const base = {
            chart: {
                backgroundColor: 'transparent',
                height: 280, // Bumped slightly up from 220 to account for the timeline size
                spacing: [8, 10, 8, 10],
                style: { fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }
            },
            title: { text: null },
            // Enable the Range Selector UI buttons (Zoom 1d, 1w, All)
            rangeSelector: {
                enabled: true,
                inputEnabled: false, // Hides the manual calendar date inputs to save layout space
                buttonTheme: {
                    fill: 'rgba(95, 160, 255, 0.08)',
                   stroke: 'rgba(95, 160, 255, 0.24)',
                   style: { color: '#dbe5ff' },
                   states: {
                       hover: { fill: 'rgba(95, 160, 255, 0.2)', style: { color: '#ffffff' } },
                   select: { fill: '#5f9cff', style: { color: '#101d37', fontWeight: 'bold' } }
                   }
                },
                labelStyle: { color: '#8fa5d2' },
                selected: 5 // Default zoom option (All)
            },
            // Enable the mini chart timeline slider beneath the chart window
            navigator: {
                enabled: true,
                maskFill: 'rgba(95, 160, 255, 0.1)',
                   outlineColor: 'rgba(95, 160, 255, 0.25)',
                   handles: { backgroundColor: '#5f9cff', borderColor: '#b5c9ff' },
                   series: { color: '#5f9cff', fillOpacity: 0.05 }
            },
            scrollbar: {
                enabled: false // Hides the tiny scrolling track bar just below the navigator
            },
            xAxis: {
                type: 'datetime',
                crosshair: true,
                labels: {
                    style: { color: '#dbe5ff', fontSize: '11px' },
                    autoRotation: [-30],
                    reserveSpace: false,
                    y: 10,
                    format: '{value:%b %e %H:%M}'
                },
                lineColor: 'rgba(95, 160, 255, 0.24)',
                   tickColor: 'rgba(95, 160, 255, 0.24)'
            },
            yAxis,
            tooltip: {
                shared: true,
                split: false,
                useHTML: true,
                backgroundColor: '#101d37',
                borderColor: '#5f9cff',
                borderRadius: 6,
                style: { color: '#eef6ff', pointerEvents: 'none' },
                headerFormat: '<span style="font-size:0.95em">{point.key}</span><br/>',
                crosshairs: true,
                stickOnContact: false
            },
            legend: {
                enabled: chart.series.length > 1,
                itemStyle: { color: '#dbe5ff' },
                itemHoverStyle: { color: '#b5c9ff' }
            },
            plotOptions: {
                series: {
                    marker: { radius: 3 },
                   stickyTracking: true
                },
                column: {
                    borderRadius: 4,
                   groupPadding: 0,
                   pointPadding: 0,
                   pointPlacement: 'between'
                }
            },
            series: chart.series.map(series => ({
                name: series.label,
                data: series.data,
                type: series.type,
                color: series.color,
                yAxis: series.yAxis ?? 0,
                marker: { enabled: series.type !== 'column' }
            })),
            credits: { enabled: false }
        };

        // Use stockChart if it's available for advanced timelines, fall back to standard charts
        if (typeof Highcharts.stockChart === 'function') {
            Highcharts.stockChart(chart.id, base);
        } else {
            Highcharts.chart(chart.id, base);
        }
    });
}

function resetCharts() {
    state.currentCharts = [];
    chartCounter = 0;
}

function getResourcePath(resource) {
    const pathname = location.pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '');
    const depth = pathname.split('/').filter(Boolean).length;
    return `${'../'.repeat(depth)}${resource}`;
}

async function fetchJson(resource) {
    const url = getResourcePath(resource);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Unable to load ${resource}`);
    return res.json();
}

async function fetchApi(resource, options = {}) {
    const res = await fetch(resource, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`API request failed: ${res.status} ${text}`);
    }
    return res.json();
}

async function fetchBadgeJson(resource) {
    // Get the original path
    const originalPath = getResourcePath(resource);

    // Replace '/games/' with '/games/badges/'
    const url = originalPath.replace('/games/', '/games/badges/');

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Unable to load ${resource} from ${url}`);
    return res.json();
}

function route() {
    const rawPath = location.pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '');
    const path = rawPath || '/';
    if (path === '/' || path === '/index.html') {
        state.indexTab = 'games';
        state.indexSort = { key: 'v', dir: -1 };
        renderIndexPage();
        return;
    }
    if (path === '/add' || path === '/add/index.html') {
        renderAddPage();
        return;
    }
    if (path === '/groups' || path === '/groups/index.html') {
        state.indexTab = 'groups';
        state.indexSort = { key: 'm', dir: -1 };
        renderIndexPage();
        return;
    }
    const segments = path.slice(1).split('/');
    if (segments[0] === 'games' && segments[1]) {
        if (segments[2]) {
            renderBadgePage(segments[1], segments[2]);
        } else {
            renderGamePage(segments[1]);
        }
        return;
    }
    if (segments[0] === 'groups' && segments[1]) {
        renderGroupPage(segments[1]);
        return;
    }
    renderNotFound();
}

function navigate(path) {
    history.pushState(null, '', path);
    route();
}

window.addEventListener('popstate', route);
window.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([loadGames(), loadGroups()]);
    route();
    document.body.addEventListener('click', handleGlobalNav);
});

function handleGlobalNav(event) {
    const anchor = event.target.closest('a[data-nav]');
    if (!anchor) return;
    const url = anchor.getAttribute('href');
    if (!url || url.startsWith('http')) return;
    event.preventDefault();
    navigate(url);
}

async function loadGames() {
    if (state.games) return;
    try {
        state.games = await fetchJson('games_index.json');
        state.games = state.games.map(game => ({
            ...game,
            v24: game.v24 ?? 0
        }));
    } catch (error) {
        state.games = [];
        console.error(error);
    }
}

async function loadGroups() {
    if (state.groups) return;
    try {
        state.groups = await fetchJson('groups_index.json');
    } catch (error) {
        state.groups = [];
        console.error(error);
    }
}

function formatNumber(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return '-';
    return value.toLocaleString();
}

function formatPercent(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return '-';
    return `${value.toFixed(4)}%`;
}

function formatTime(timestamp, options = {}) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        ...options
    });
}

function formatChartLabel(timestamp) {
    const date = new Date(timestamp * 1000);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours();
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hour}:${minute}`;
}

function sortGames(games) {
    const { key, dir } = state.indexSort;
    return [...games].sort((a, b) => {
        const av = a[key] ?? 0;
        const bv = b[key] ?? 0;
        if (av === bv) return a.n.localeCompare(b.n);
        return dir * (av > bv ? 1 : -1);
    });
}

function buildSortButton(field, label) {
    const active = state.indexSort.key === field;
    const arrow = active ? (state.indexSort.dir < 0 ? '▼' : '▲') : '';
    return `<button type="button" onclick="window.__appSort('${field}')">${label} ${arrow}</button>`;
}

window.__appSort = field => {
    state.currentPage = 1;
    if (state.indexSort.key === field) {
        state.indexSort.dir *= -1;
    } else {
        state.indexSort.key = field;
        state.indexSort.dir = -1;
    }
    renderIndexPage();
};

window.__setIndexTab = tab => {
    state.currentPage = 1;
    if (state.indexTab === tab) return;
    state.indexTab = tab;
    state.indexSort = tab === 'groups' ? { key: 'm', dir: -1 } : { key: 'v', dir: -1 };
    navigate(tab === 'groups' ? '/groups' : '/');
};

window.__setPage = pageNum => {
    state.currentPage = pageNum;
    renderIndexPage();
    // Smooth scroll back to top of index table when flipping pages
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

function getIndexSortLabel() {
    const labels = {
        m: 'member count',
        gc: 'game count',
        p: 'player count',
        v: 'visits',
        v24: '24h visit gain',
        l: 'likes',
        d: 'dislikes',
        f: 'favorites',
        r: 'like %'
    };
    return labels[state.indexSort.key] || state.indexSort.key;
}

function renderIndexPage() {
    if (state.indexTab === 'groups') {
        state.addType = null;
        state.addId = '';
        state.addPreview = null;
        state.addError = null;
        state.addStatus = 'idle';
    }
    const items = state.indexTab === 'groups' ? (state.groups || []) : (state.games || []);
    const query = state.searchQuery.trim().toLowerCase();
    const filtered = items.filter(item => !query || item.n.toLowerCase().includes(query));
    const sorted = sortGames(filtered);
    const isGroups = state.indexTab === 'groups';
    const countLabel = isGroups ? 'groups' : 'games';
    const title = isGroups ? 'Group Index' : 'Game Index';
    const emptyMessage = isGroups ? 'No groups found.' : 'No games found.';

    // Pagination parameters
    const itemsPerPage = 100;
    const totalItems = sorted.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

    if (state.currentPage > totalPages) state.currentPage = totalPages;
    if (state.currentPage < 1) state.currentPage = 1;

    const startIndex = (state.currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedItems = sorted.slice(startIndex, endIndex);

    const sortButtons = isGroups
    ? `${buildSortButton('m', 'Members')} ${buildSortButton('gc', 'Games')} ${buildSortButton('p', 'Players')} ${buildSortButton('v', 'Visits')}`
    : `${buildSortButton('p', 'Players')} ${buildSortButton('v', 'Visits')} ${buildSortButton('v24', '24h Visits')} ${buildSortButton('l', 'Likes')} ${buildSortButton('d', 'Dislikes')} ${buildSortButton('f', 'Favorites')} ${buildSortButton('r', 'Like %')}`;

    // Interactive Pagination UI with a manual page type-in input box
    let paginationHtml = '';
    if (totalPages > 1) {
        paginationHtml = `
        <div class="pagination-row" style="display: flex; justify-content: center; align-items: center; gap: 16px; margin-top: 20px; padding: 10px; flex-wrap: wrap;">
        <button type="button" ${state.currentPage === 1 ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''} onclick="window.__setPage(${state.currentPage - 1})">← Previous</button>

        <div style="display: flex; align-items: center; gap: 6px; color: #dbe5ff; font-size: 0.9em;">
        <span>Page</span>
        <input
        type="number"
        min="1"
        max="${totalPages}"
        value="${state.currentPage}"
        style="width: 55px; background: rgba(0,0,0,0.3); border: 1px solid rgba(95, 160, 255, 0.3); color: #fff; text-align: center; padding: 3px; border-radius: 4px;"
        onchange="let p = parseInt(this.value); if(p >= 1 && p <= ${totalPages}) { window.__setPage(p); } else { this.value = state.currentPage; }"
        onkeydown="if(event.key === 'Enter') { let p = parseInt(this.value); if(p >= 1 && p <= ${totalPages}) { window.__setPage(p); } else { this.value = state.currentPage; } }"
        />
        <span>of <strong>${totalPages}</strong></span>
        </div>

        <button type="button" ${state.currentPage === totalPages ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''} onclick="window.__setPage(${state.currentPage + 1})">Next →</button>
        </div>`;
    }

    app.innerHTML = `
    <section class="panel hero-panel">
    <div class="control-row">
    <div>
    <h1>${title}</h1>
    <p class="small-note">Sorted by ${getIndexSortLabel()}. Showing ${startIndex + 1}-${Math.min(endIndex, totalItems)} of ${totalItems}.</p>
    </div>
    <input id="searchInput" type="search" placeholder="Filter ${countLabel} by name..." value="${escapeHtml(state.searchQuery)}" />
    </div>
    <div class="tab-menu">
    <button class="${state.indexTab === 'games' ? 'active' : ''}" onclick="window.__setIndexTab('games')">Games</button>
    <button class="${state.indexTab === 'groups' ? 'active' : ''}" onclick="window.__setIndexTab('groups')">Groups</button>
    </div>
    <div class="control-row">
    <div class="badge-pill">${totalItems} ${countLabel}</div>
    <div>${sortButtons}</div>
    </div>
    </section>
    <section class="panel table-shell">
    ${paginatedItems.length ? `
        <table>
        <thead>
        ${isGroups ? `
            <tr>
            <th>Group</th>
            <th>Members</th>
            <th>Games</th>
            <th>Players</th>
            <th>Visits</th>
            </tr>
            ` : `
            <tr>
            <th>Game</th>
            <th>Players</th>
            <th>Visits</th>
            <th>24h Gain</th>
            <th>Likes</th>
            <th>Dislikes</th>
            <th>Favorites</th>
            <th>Like %</th>
            </tr>
            `}
            </thead>
            <tbody>
            ${paginatedItems.map(item => isGroups ? `
                <tr>
                <td><a data-nav="true" href="${getResourcePath(`groups/${item.id}/`)}">${escapeHtml(item.n)}</a></td>
                <td>${formatNumber(item.m)}</td>
                <td>${formatNumber(item.gc)}</td>
                <td>${formatNumber(item.p)}</td>
                <td>${formatNumber(item.v)}</td>
                </tr>
                ` : `
                <tr>
                <td><a data-nav="true" href="${getResourcePath(`games/${item.id}/`)}">${escapeHtml(item.n)}</a></td>
                <td>${formatNumber(item.p)}</td>
                <td>${formatNumber(item.v)}</td>
                <td>${formatNumber(item.v24)}</td>
                <td>${formatNumber(item.l)}</td>
                <td>${formatNumber(item.d)}</td>
                <td>${formatNumber(item.f)}</td>
                <td>${formatPercent(item.r)}</td>
                </tr>
                `).join('')}
                </tbody>
                </table>
                ${paginationHtml}
                ` : `<p class="small-note">${emptyMessage}</p>`}
                </section>
                `;

                const searchInput = document.getElementById('searchInput');
                searchInput.addEventListener('input', event => {
                    state.searchQuery = event.target.value;
                    state.currentPage = 1; // Reset to page 1 on search filter change
                    renderIndexPage();
                });

                // Maintain cursor focus at the end of input text across re-renders
                if (document.activeElement?.id !== 'searchInput') {
                    searchInput.focus();
                    searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
                }
}

function escapeHtml(value) {
    return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderAddPage() {
    const canAdd = state.addPreview && !state.addPreview.alreadyAdded;
    const isLoaded = state.addStatus === 'loading';
    const hasAdded = state.addStatus === 'added';
    app.innerHTML = `
    <section class="panel hero-panel">
    <div class="control-row">
    <div>
    <a class="link-button" data-nav="true" href="/">← Back to home</a>
    </div>
    <div class="badge-pill">Add Game or Group</div>
    </div>
    <div>
    <h1>Add content to the tracker</h1>
    <p class="small-note">Choose a type, validate it, and append it to ${state.addType === 'game' ? 'the games list' : state.addType === 'group' ? 'the groups list' : 'the database'}.</p>
    </div>
    </section>
    <section class="panel table-shell">
    ${!state.addType ? `
        <div class="control-row">
        <button type="button" class="addbutton" onclick="window.__startAdd('game')">Add Game</button>
        <button type="button" class="addbutton" onclick="window.__startAdd('group')">Add Group</button>
        </div>
        ` : `
        <div class="control-row">
        <button type="button" onclick="window.__resetAdd()">Choose a different type</button>
        </div>
        <div class="control-row">
        <label>${state.addType === 'game' ? 'Place ID' : 'Group ID'}</label>
        <input id="addIdInput" type="text" placeholder="Enter ID..." value="${escapeHtml(state.addId)}" oninput="window.__setAddId(this.value)" />
        <button type="button" onclick="window.__fetchAddPreview()" ${isLoaded ? 'disabled' : ''}>${isLoaded ? 'Looking up…' : 'Lookup'}</button>
        </div>
        ${state.addError ? `<p class="small-note" style="color:#ff8c8c">${escapeHtml(state.addError)}</p>` : ''}
        ${state.addPreview ? `
            <div class="chart-frame">
            <h2>Preview</h2>
            <p class="small-note">${escapeHtml(state.addPreview.description || '')}</p>
            <table class="preview-table">
            <tbody>
            <tr><th>Name</th><td>${escapeHtml(state.addPreview.name)}</td></tr>
            ${state.addType === 'group' ? `<tr><th>Members</th><td>${formatNumber(state.addPreview.memberCount)}</td></tr><tr><th>Games</th><td>${formatNumber(state.addPreview.gamesCount)}</td></tr>` : ''}
            ${state.addType === 'game' ? `<tr><th>Universe</th><td>${formatNumber(state.addPreview.universeId)}</td></tr><tr><th>Creator</th><td>${escapeHtml(state.addPreview.creatorName || 'Unknown')}</td></tr><tr><th>Players</th><td>${formatNumber(state.addPreview.playing)}</td></tr><tr><th>Favorites</th><td>${formatNumber(state.addPreview.favoritedCount)}</td></tr>` : ''}
            </tbody>
            </table>
            ${state.addType === 'group' && state.addPreview.games?.length ? `
                <div class="small-note">Games in group: ${escapeHtml(state.addPreview.games.map(g => g.name).slice(0, 6).join(', '))}${state.addPreview.games.length > 6 ? '...' : ''}</div>
                ` : ''}
                <div class="control-row" style="margin-top:16px; gap:12px; flex-wrap:wrap;">
                <button type="button" onclick="window.__confirmAdd()" ${canAdd ? '' : 'disabled'}>${state.addPreview.alreadyAdded ? 'Already added' : 'Add'}</button>
                ${hasAdded ? `<button type="button" onclick="window.__resetAdd()">Add another</button>` : ''}
                </div>
                </div>
                ` : ''}
                `}
                </section>
                ${hasAdded ? `
                    <section class="panel table-shell">
                    <p class="small-note">Successfully added. You can go back home or add another item.</p>
                    <div class="control-row" style="gap:12px; flex-wrap:wrap;">
                    <button type="button" onclick="window.__goHome()">Home</button>
                    <button type="button" onclick="window.__resetAdd()">Add another</button>
                    </div>
                    </section>
                    ` : ''}
                    `;
}

window.__startAdd = type => {
    state.addType = type;
    state.addId = '';
    state.addPreview = null;
    state.addError = null;
    state.addStatus = 'idle';
    renderAddPage();
};

window.__setAddId = value => {
    state.addId = value;
};

window.__resetAdd = () => {
    state.addType = null;
    state.addId = '';
    state.addPreview = null;
    state.addError = null;
    state.addStatus = 'idle';
    renderAddPage();
};

window.__goHome = () => {
    navigate('/');
};

window.__fetchAddPreview = async () => {
    if (!state.addType || !state.addId.trim()) {
        state.addError = 'Enter a valid ID to continue.';
        renderAddPage();
        return;
    }

    state.addError = null;
    state.addPreview = null;
    state.addStatus = 'loading';
    renderAddPage();

    try {
        if (state.addType === 'group') {
            state.addPreview = await fetchApi(`/api/group/${encodeURIComponent(state.addId.trim())}`);
        } else {
            state.addPreview = await fetchApi(`/api/place/${encodeURIComponent(state.addId.trim())}`);
        }
        state.addStatus = 'ready';
    } catch (error) {
        state.addError = error.message;
        state.addPreview = null;
        state.addStatus = 'error';
    }
    renderAddPage();
};

window.__confirmAdd = async () => {
    if (!state.addPreview || state.addPreview.alreadyAdded) return;
    state.addStatus = 'loading';
    renderAddPage();

    try {
        if (state.addType === 'group') {
            await fetchApi('/api/groups', {
                method: 'POST',
                body: JSON.stringify({ id: state.addPreview.id })
            });
        } else {
            await fetchApi('/api/games', {
                method: 'POST',
                body: JSON.stringify({ universeId: state.addPreview.universeId })
            });
        }
        state.addPreview.alreadyAdded = true;
        state.addStatus = 'added';
    } catch (error) {
        state.addError = error.message;
        state.addStatus = 'error';
    }
    renderAddPage();
};

async function renderGamePage(gameId) {
    resetCharts();
    const game = state.games.find(item => String(item.id) === String(gameId));
    let meta = null;
    let history = null;
    let badges = null;
    try {
        meta = await fetchJson(`games/${gameId}/metadata.json`);
    } catch (error) {
        renderError(`Game metadata not found for ${gameId}.`);
        return;
    }
    const previousGameId = state.currentGameId;
    state.currentGameId = gameId;
    if (previousGameId !== gameId) {
        state.gameHistoryMode = 'auto';
    }

    const defaultFiles = ['latest.json', '10m.json', '30m.json', '1h.json'];
    let autoHistory = null;
    let dailyHistory = null;
    let dailyExists = false;
    let otherExists = false;

    for (const file of defaultFiles) {
        try {
            const data = await fetchJson(`games/${gameId}/${file}`);
            if (Array.isArray(data) && data.length) {
                autoHistory = data;
                otherExists = true;
                break;
            }
        } catch {
            continue;
        }
    }

    try {
        const data = await fetchJson(`games/${gameId}/1d.json`);
        if (Array.isArray(data) && data.length) {
            dailyHistory = data;
            dailyExists = true;
        }
    } catch {
        dailyHistory = null;
    }

    if (state.gameHistoryMode === 'daily' && dailyExists) {
        history = dailyHistory;
    } else if (autoHistory) {
        history = autoHistory;
    } else if (dailyHistory) {
        history = dailyHistory;
    }

    if (!history) {
        renderError('No history data available for this game.');
        return;
    }

    try {
        badges = await fetchJson(`games/${gameId}/badges/index.json`);
    } catch {
        badges = [];
    }

    let prevVisits = 0, prevFavs = 0, prevLikes = 0, prevDislikes = 0, prevPlayers = 0;
    const points = history.slice().filter(point => point && typeof point.time === 'number').map((point, index) => {
        const cleaned = { ...point };
        if (index === 0) {
            prevVisits = cleaned.visits || 0;
            prevFavs = cleaned.favorites || 0;
            prevLikes = cleaned.likes || 0;
            prevDislikes = cleaned.dislikes || 0;
            prevPlayers = cleaned.players || 0;
            return cleaned;
        }

        // If values drop to 0 at random, retain the previous interval value
        if ((cleaned.visits === 0 || !cleaned.visits) && prevVisits) cleaned.visits = prevVisits; else prevVisits = cleaned.visits || 0;
        if ((cleaned.favorites === 0 || !cleaned.favorites) && prevFavs) cleaned.favorites = prevFavs; else prevFavs = cleaned.favorites || 0;
        if ((cleaned.likes === 0 || !cleaned.likes) && prevLikes) cleaned.likes = prevLikes; else prevLikes = cleaned.likes || 0;
        if ((cleaned.dislikes === 0 || !cleaned.dislikes) && prevDislikes) cleaned.dislikes = prevDislikes; else prevDislikes = cleaned.dislikes || 0;
        if ((cleaned.players === 0 || !cleaned.players) && prevPlayers) cleaned.players = prevPlayers; else prevPlayers = cleaned.players || 0;

        // Re-calculate ratio if likes/dislikes were corrected
        if ((cleaned.likes + cleaned.dislikes) > 0) {
            cleaned.ratio = (cleaned.likes / (cleaned.likes + cleaned.dislikes)) * 100;
        }

        return cleaned;
    });
    if (!points.length) {
        renderError('No usable history points were found for this game.');
        return;
    }
    const visitGain = points.map((point, index) => index === 0 ? 0 : Math.max(0, (point.visits || 0) - (points[index - 1].visits || 0)));
    const likesGain = points.map((point, index) => index === 0 ? 0 : (point.likes || 0) - (points[index - 1].likes || 0));
    const dislikesGain = points.map((point, index) => index === 0 ? 0 : (point.dislikes || 0) - (points[index - 1].dislikes || 0));
    const favGain = points.map((point, index) => index === 0 ? 0 : Math.max(0, (point.favorites || 0) - (points[index - 1].favorites || 0)));

    const normalizeGain = (values, points) => values.map((value, index) => {
        if (index === 0) return 0;

        // If the tracker is in daily history mode, return the raw daily gain value directly
        if (state.gameHistoryMode === 'daily') return value;

        const delta = points[index].time - points[index - 1].time;
        if (delta <= 600) return value;
        const divisor = delta / 600;
        return Math.round(value / divisor);
    });

    const visitGainNorm = normalizeGain(visitGain, points);
    const likesGainNorm = normalizeGain(likesGain, points);
    const dislikesGainNorm = normalizeGain(dislikesGain, points);
    const favGainNorm = normalizeGain(favGain, points);

    const current = points[points.length - 1];
    const playersText = formatNumber(current.players || meta.playing || 0);
    const visitsText = formatNumber(current.visits || meta.visits || 0);
    const likesText = formatNumber(current.likes || 0);
    const dislikesText = formatNumber(current.dislikes || 0);
    const favoritesText = formatNumber(current.favorites || meta.favorites || 0);
    const ratioText = formatPercent(current.ratio ?? meta.ratio ?? 0);

    const playersSeries = points.map(point => [point.time * 1000, point.players || 0]);
    const visitsSeries = points.map(point => [point.time * 1000, point.visits || 0]);
    const likesSeries = points.map(point => [point.time * 1000, point.likes || 0]);
    const dislikesSeries = points.map(point => [point.time * 1000, point.dislikes || 0]);
    const favoritesSeries = points.map(point => [point.time * 1000, point.favorites || 0]);
    const ratioSeries = points.map(point => [point.time * 1000, point.ratio || 0]);
    const visitGainSeries = points.map((point, index) => [point.time * 1000, visitGainNorm[index]]);
    const likesGainSeries = points.map((point, index) => [point.time * 1000, likesGainNorm[index]]);
    const dislikesGainSeries = points.map((point, index) => [point.time * 1000, dislikesGainNorm[index]]);
    const favGainSeries = points.map((point, index) => [point.time * 1000, favGainNorm[index]]);

    app.innerHTML = `
    <section class="panel hero-panel">
    <div class="control-row">
    <div>
    <a class="link-button" data-nav="true" href="../../">← Back to games</a>
    </div>
    <div class="badge-pill">Universe ${escapeHtml(gameId)}</div>
    </div>
    <div>
    <h1>${escapeHtml(meta.name || game?.n || 'Unknown Game')}</h1>
    <p class="small-note">${escapeHtml(meta.description || 'No description available.')}</p>
    </div>
    <div class="stat-grid">
    <div class="stat-card"><strong>${playersText}</strong><span>Players</span></div>
    <div class="stat-card"><strong>${visitsText}</strong><span>Visits</span></div>
    <div class="stat-card"><strong>${likesText}</strong><span>Likes</span></div>
    <div class="stat-card"><strong>${dislikesText}</strong><span>Dislikes</span></div>
    <div class="stat-card"><strong>${favoritesText}</strong><span>Favorites</span></div>
    <div class="stat-card"><strong>${ratioText}</strong><span>Like %</span></div>
    </div>
    <p class="status-line"></p>
    </section>
    <section class="panel chart-panel">
    <div class="tab-menu">
    <button class="${state.activeTab === 'trends' ? 'active' : ''}" onclick="window.__setGameTab('trends')">Trends</button>
    <button class="${state.activeTab === 'badges' ? 'active' : ''}" onclick="window.__setGameTab('badges')">Badges</button>
    ${dailyExists && otherExists ? `<button class="${state.gameHistoryMode === 'daily' ? 'active' : ''}" onclick="window.__setGameHistoryMode('${state.gameHistoryMode === 'daily' ? 'auto' : 'daily'}')">${state.gameHistoryMode === 'daily' ? 'Recent' : 'Daily'}</button>` : ''}
    </div>
    ${state.activeTab === 'trends' ? `
        <div class="chart-grid">
        ${renderChartPanel('Players', [{ label: 'Players', data: playersSeries, color: colors[0] }])}
        ${renderLineBarPanel('Visits', '', visitsSeries, visitGainSeries, colors[0], colors[2], 'Visits', 'Gain')}
        ${renderChartPanel('Likes + Dislikes', [{ label: 'Likes', data: likesSeries, color: colors[1] }, { label: 'Dislikes', data: dislikesSeries, color: colors[3] }])}
        ${renderBarPanel('Like Change + Dislike Change', [{ label: 'Likes change', data: likesGainSeries, color: colors[1] }, { label: 'Dislikes change', data: dislikesGainSeries, color: colors[3] }])}
        ${renderLineBarPanel('Favorites', '', favoritesSeries, favGainSeries, colors[1], colors[2], 'Favorites', 'Gain')}
        ${renderChartPanel('Like %', [{ label: 'Like %', data: ratioSeries, color: colors[0] }])}
        </div>
        ` : renderBadgesTable(gameId, badges)}
        </section>
        `;
        window.requestAnimationFrame(() => drawCharts(state.currentCharts));
}

window.__setGameTab = tab => {
    state.activeTab = tab;
    route();
};

window.__setGameHistoryMode = mode => {
    state.gameHistoryMode = mode;
    if (state.currentGameId) {
        renderGamePage(state.currentGameId);
    }
};

function renderBadgesTable(gameId, badges) {
    if (!Array.isArray(badges) || !badges.length) {
        return `<div class="chart-frame"><p class="small-note">Theres most likely no badges for this game :P</p></div>`;
    }
    const rows = badges.map(badge => `
    <tr>
    <td><a data-nav="true" href="./${badge.id}">${escapeHtml(badge.n)}</a></td>
    <td>${formatNumber(badge.total)}</td>
    <td>${badge.win ? formatPercent(badge.win * 100) : '-'}</td>
    </tr>
    `).join('');
    return `
    <div class="chart-frame">
    <div class="status-line">Badge listing sorted by index order. Click a badge to view detailed history.</div>
    <table class="badge-table">
    <thead>
    <tr>
    <th>Name</th>
    <th>Awarded Count</th>
    <th>Win Rate</th>
    </tr>
    </thead>
    <tbody>${rows}</tbody>
    </table>
    </div>
    `;
}

async function renderBadgePage(gameId, badgeId) {
    let badgeIndex;
    let badgeMeta;
    let badgeHistory;
    try {
        badgeIndex = await fetchJson(`games/${gameId}/badges/index.json`);
        badgeMeta = badgeIndex.find(item => String(item.id) === String(badgeId));
    } catch {
        badgeMeta = null;
    }
    if (!badgeMeta) {
        renderError('Badge metadata not found.');
        return;
    }
    try {
        badgeHistory = await fetchJson(`games/${gameId}/badges/${badgeId}.json`);
    } catch {
        renderError('Badge history file not found.');
        return;
    }
    if (!Array.isArray(badgeHistory) || !badgeHistory.length) {
        renderError('Badge history is empty.');
        return;
    }
    const points = badgeHistory.map(point => ({
        time: point.t,
        total: point.total || 0,
        awarded: point.a || 0
    }));
    const totalSeries = points.map(point => [point.time * 1000, point.total]);
    const awardedSeries = points.map(point => [point.time * 1000, point.awarded]);
    resetCharts();
    app.innerHTML = `
    <section class="panel hero-panel">
    <div class="control-row">
    <div>
    <a class="link-button" data-nav="true" href="../${gameId}/">← Back to game</a>
    </div>
    <div class="badge-pill">Badge ${escapeHtml(String(badgeId))}</div>
    </div>
    <div>
    <h1>${escapeHtml(badgeMeta.n)}</h1>
    <p class="small-note">${escapeHtml(badgeMeta.d || 'No description available.')}</p>
    </div>
    <div class="stat-grid">
    <div class="stat-card"><strong>${formatNumber(badgeMeta.total)}</strong><span>Total Awarded</span></div>
    <div class="stat-card"><strong>${badgeMeta.win ? formatPercent(badgeMeta.win * 100) : '-'}</strong><span>Win Chance</span></div>
    </div>
    </section>
    <section class="panel chart-panel">
    <div class="chart-grid">
    ${renderLineBarPanel('Badge Awards', 'Total awarded and awards received in the latest interval', totalSeries, awardedSeries, colors[0], colors[2], 'Total', 'Recently awarded')}
    </div>
    </section>
    `;
    window.requestAnimationFrame(() => drawCharts(state.currentCharts));
}

async function renderGroupPage(groupId) {
    resetCharts();
    let metadata = null;
    let history = null;
    try {
        metadata = await fetchJson(`groups/${groupId}/metadata.json`);
    } catch (error) {
        renderError(`Group metadata not found for ${groupId}.`);
        return;
    }
    try {
        history = await fetchJson(`groups/${groupId}/1d.json`);
    } catch (error) {
        renderError('No history data available for this group.');
        return;
    }
    if (!Array.isArray(history) || !history.length) {
        renderError('No usable history points were found for this group.');
        return;
    }

    const points = history.slice().filter(point => point && typeof point.t === 'number');
    if (!points.length) {
        renderError('No usable history points were found for this group.');
        return;
    }

    const memberSeries = points.map(point => [point.t * 1000, point.m || 0]);
    const playerSeries = points.map(point => [point.t * 1000, point.p || 0]);
    const visitSeries = points.map(point => [point.t * 1000, point.v || 0]);
    const memberGainSeries = points.map((point, index) => [point.t * 1000, index === 0 ? 0 : Math.max(0, (point.m || 0) - (points[index - 1].m || 0))]);
    const playerGainSeries = points.map((point, index) => [point.t * 1000, index === 0 ? 0 : Math.max(0, (point.p || 0) - (points[index - 1].p || 0))]);
    const visitGainSeries = points.map((point, index) => [point.t * 1000, index === 0 ? 0 : Math.max(0, (point.v || 0) - (points[index - 1].v || 0))]);

    const latest = points[points.length - 1];
    const playersText = formatNumber(latest.p);
    const visitsText = formatNumber(latest.v);
    const membersText = formatNumber(latest.m || metadata.memberCount || 0);
    const gamesText = formatNumber((metadata.games || []).length);

    const gameDetails = await Promise.all((metadata.games || []).map(async game => {
        let gameMeta = null;
        try {
            gameMeta = await fetchJson(`games/${game.id}/metadata.json`);
        } catch {
            gameMeta = null;
        }
        const indexEntry = state.games?.find(item => String(item.id) === String(game.id));
        return {
            id: game.id,
            name: gameMeta?.name || game.n || `Game ${game.id}`,
            players: gameMeta?.playing ?? 0,
            visits: gameMeta?.visits ?? 0,
            favorites: gameMeta?.favorites ?? gameMeta?.favoritedCount ?? 0,
            v24: indexEntry?.v24 ?? gameMeta?.v24 ?? 0
        };
    }));

    const gameRows = gameDetails.map(game => `
    <tr>
    <td><a data-nav="true" href="${getResourcePath('games/' + game.id)}">${escapeHtml(game.name)}</a></td>
    <td>${formatNumber(game.players)}</td>
    <td>${formatNumber(game.visits)}</td>
    <td>${formatNumber(game.v24)}</td>
    </tr>
    `).join('');

    app.innerHTML = `
    <section class="panel hero-panel">
    <div class="control-row">
    <div>
    <a class="link-button" data-nav="true" href="${getResourcePath('groups')}">← Back to groups</a>
    </div>
    <div class="badge-pill">Group ${escapeHtml(String(groupId))}</div>
    </div>
    <div>
    <h1>${escapeHtml(metadata.name || `Group ${groupId}`)}</h1>
    <p class="small-note">${escapeHtml(metadata.description || 'No description available.')}</p>
    </div>
    <div class="stat-grid">
    <div class="stat-card"><strong>${membersText}</strong><span>Members</span></div>
    <div class="stat-card"><strong>${gamesText}</strong><span>Tracked Games</span></div>
    <div class="stat-card"><strong>${playersText}</strong><span>Total Players</span></div>
    <div class="stat-card"><strong>${visitsText}</strong><span>Total Visits</span></div>
    </div>
    <p class="status-line">Showing trend data for the group and its tracked games.</p>
    </section>
    <section class="panel chart-panel">
    <div class="chart-grid">
    ${renderLineBarPanel('Members', 'Member total plus daily change', memberSeries, memberGainSeries, colors[0], colors[2], 'Members', 'Gain')}
    ${renderChartPanel('Total Players', [{ label: 'Players', data: playerSeries, color: colors[1] }])}
    ${renderChartPanel('Total Visits', [{ label: 'Visits', data: visitSeries, color: colors[2] }])}
    </div>
    </section>
    <section class="panel table-shell">
    <h2>Tracked Games</h2>
    ${gameRows ? `
        <table>
        <thead>
        <tr>
        <th>Game</th>
        <th>Players</th>
        <th>Visits</th>
        <th>24h V Gain</th>
        </tr>
        </thead>
        <tbody>${gameRows}</tbody>
        </table>
        ` : `<p class="small-note">No tracked game matches were found in the game index.</p>`}
        </section>
        `;
        window.requestAnimationFrame(() => drawCharts(state.currentCharts));
}

function renderNotFound() {
    app.innerHTML = `
    <section class="panel hero-panel">
    <h1>Page not found</h1>
    <p class="small-note">We couldn't resolve that route. Try returning to the game index.</p>
    <a class="cta-button" data-nav="true" href="./">Back to index</a>
    </section>
    `;
}

function renderError(message) {
    app.innerHTML = `
    <section class="panel hero-panel">
    <h1>Error</h1>
    <p class="small-note">${escapeHtml(message)}</p>
    <a class="cta-button" data-nav="true" href="./">Back to index</a>
    </section>
    `;
}

function renderChartPanel(title, datasets) {
    const chartId = getChartId('chart');
    state.currentCharts.push({
        id: chartId,
        title,
        series: datasets.map(series => ({
            label: series.label,
            data: series.data,
            color: series.color,
            type: 'line',
            yAxis: 0
        }))
    });
    return `
    <article class="chart-frame">
    <div>
    <h2>${escapeHtml(title)}</h2>
    </div>
    <div id="${chartId}" class="chart-canvas"></div>
    </article>
    `;
}

function getPointRange(data) {
    if (!Array.isArray(data) || data.length < 2) return 0;
    return Math.max(...data.slice(1).map((point, index) => {
        const current = point[0];
        const prev = data[index][0];
        return current - prev;
    }));
}

function renderLineBarPanel(title, subtitle, lineData, barData, lineColor, barColor, lineLabel, barLabel) {
    const chartId = getChartId('chart');
    const barRange = getPointRange(barData) || getPointRange(lineData);
    state.currentCharts.push({
        id: chartId,
        title,
        yAxis: [
            { title: { text: null }, labels: { style: { color: '#dbe5ff' } }, gridLineColor: 'rgba(255,255,255,0.08)' },
                             { title: { text: null }, labels: { style: { color: '#dbe5ff' } }, opposite: true }
        ],
        series: [
            { label: lineLabel, data: lineData, color: lineColor, type: 'line', yAxis: 0 },
            { label: barLabel, data: barData, color: barColor, type: 'column', yAxis: 1, pointRange: barRange }
        ]
    });
    return `
    <article class="chart-frame">
    <div>
    <h2>${escapeHtml(title)}</h2>
    <p class="small-note">${escapeHtml(subtitle)}</p>
    </div>
    <div id="${chartId}" class="chart-canvas"></div>
    </article>
    `;
}

function renderBarPanel(title, barData) {
    const chartId = getChartId('chart');
    state.currentCharts.push({
        id: chartId,
        title,
        series: barData.map(bar => ({
            label: bar.label,
            data: bar.data,
            color: bar.color,
            type: 'column',
            yAxis: 0
        }))
    });
    return `
    <article class="chart-frame">
    <div>
    <h2>${escapeHtml(title)}</h2>
    </div>
    <div id="${chartId}" class="chart-canvas"></div>
    </article>
    `;
}

function renderSvgChart({ labels, datasets = [], bars = [] }) {
    if ((!datasets.length && !bars.length) || !labels.length) {
        return '<div class="small-note">No chart data available.</div>';
    }
    const values = [
        ...datasets.flatMap(series => series.values),
        ...bars.flatMap(series => series.values)
    ].filter(v => typeof v === 'number');
    const minValue = Math.min(0, ...values);
    const maxValue = Math.max(...values, 1);
    const height = 260;
    const width = 760;
    const padding = { left: 44, right: 18, top: 24, bottom: 42 };
    const range = maxValue - minValue || 1;
    const points = labels.length;
    const xStep = points > 1 ? (width - padding.left - padding.right) / (points - 1) : 1;
    const yScale = value => height - padding.bottom - ((value - minValue) / range) * (height - padding.top - padding.bottom);
    const baseline = yScale(0);
    const gridLines = [0, 1, 2, 3, 4].map(index => ({
        y: yScale(minValue + range * (4 - index) / 4),
                                                    label: formatNumber(minValue + range * (4 - index) / 4)
    }));
    const stepLabel = Math.max(1, Math.floor(points / 6));
    const labelNodes = labels.map((label, index) => {
        if (index % stepLabel !== 0 && index !== points - 1) return '';
        return `<text x="${padding.left + xStep * index}" y="${height - 16}" class="axis-label" text-anchor="middle">${escapeHtml(label)}</text>`;
    }).join('');
    const linePaths = datasets.map((dataset, index) => {
        const path = dataset.values.map((value, idx) => {
            const x = padding.left + xStep * idx;
            const y = yScale(value ?? minValue);
            return `${idx === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
        }).join(' ');
        return `<path d="${path}" fill="none" stroke="${dataset.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    }).join('');
    const barGroups = bars.map((bar, seriesIndex) => {
        const widthUnit = Math.max(10, xStep * 0.35);
        return bar.values.map((value, index) => {
            const x = padding.left + xStep * index - widthUnit / 2 + seriesIndex * (widthUnit + 2) - ((bars.length - 1) * (widthUnit + 2) / 2);
            const y = yScale(Math.max(value, 0));
            const heightValue = Math.abs(baseline - yScale(value));
            return `<rect x="${x.toFixed(2)}" y="${Math.min(y, baseline).toFixed(2)}" width="${widthUnit.toFixed(2)}" height="${heightValue.toFixed(2)}" fill="${bar.color}" rx="3"/>`;
        }).join('');
    }).join('');

    const legendNodes = [
        ...datasets.map((series, index) => `<span class="color-${index + 1}">${escapeHtml(series.label)}</span>`),
        ...bars.map((series, index) => `<span class="color-${datasets.length + index + 1}">${escapeHtml(series.label)}</span>`)
    ].join('');

    return `
    <div class="chart-frame-inner">
    <svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
    <g stroke="rgba(255,255,255,0.06)" stroke-width="1">
    ${gridLines.map(line => `<line x1="${padding.left}" y1="${line.y.toFixed(2)}" x2="${width - padding.right}" y2="${line.y.toFixed(2)}"/>`).join('')}
    </g>
    <g fill="none" stroke="#4c5f8f" stroke-width="1" opacity="0.5">
    ${gridLines.map(line => `<text x="10" y="${line.y + 4}" fill="#8fa5d2" font-size="11">${escapeHtml(line.label)}</text>`).join('')}
    </g>
    ${linePaths}
    ${barGroups}
    <line x1="${padding.left}" y1="${baseline.toFixed(2)}" x2="${width - padding.right}" y2="${baseline.toFixed(2)}" stroke="rgba(95, 160, 255, 0.18)" stroke-width="1" />
    ${labelNodes}
    </svg>
    <div class="chart-legend">${legendNodes}</div>
    </div>
    `;
}
const state = {
    games: null,
    groups: null,
    indexSort: { key: 'v', dir: -1 },
    searchQuery: '',
    indexTab: 'games',
    activeTab: 'trends',
    currentCharts: [],
    addType: null,
    addId: '',
    addPreview: null,
    addError: null,
    addStatus: 'idle'
    currentPage: 1
};
const colors = ['#5f9cff', '#56d0a3', '#ff9f5e', '#ff6b88'];
const app = document.getElementById('app');
let chartCounter = 0;

function getChartId(prefix) {
    chartCounter += 1;
    return `${prefix}-${chartCounter}`;
}

function roundToNice(value) {
    if (value <= 0) return 0;
    const exponent = Math.floor(Math.log10(value));
    const base = Math.pow(10, exponent);
    const rounded = Math.ceil(value / base) * base;
    const fallback = Math.ceil(value / (base / 2)) * (base / 2);
    return rounded || fallback;
}

function drawCharts(charts) {
    if (!window.Highcharts || !charts?.length) return;
    charts.forEach(chart => {
        const yAxis = Array.isArray(chart.yAxis) ? [...chart.yAxis] : [{
            labels: { style: { color: '#dbe5ff' } },
            title: { text: null },
            gridLineColor: 'rgba(255,255,255,0.08)'
        }];
        const columnSeries = chart.series.filter(series => series.type === 'column');
        if (columnSeries.length) {
            const barValues = columnSeries.flatMap(series => {
                const values = series.data ?? series.values ?? [];
                return values
                .map(point => Array.isArray(point) ? point[1] : point)
                .filter(v => typeof v === 'number');
            });
            if (barValues.length) {
                const maxBar = Math.max(...barValues);
                const targetMax = roundToNice(maxBar * 3);
                if (yAxis[1]) {
                    yAxis[1] = { ...yAxis[1], max: targetMax };
                }
            }
        }
        const base = {
            chart: {
                backgroundColor: 'transparent',
                height: 280, // Bumped slightly up from 220 to account for the timeline size
                spacing: [8, 10, 8, 10],
                style: { fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }
            },
            title: { text: null },
            // Enable the Range Selector UI buttons (Zoom 1d, 1w, All)
            rangeSelector: {
                enabled: true,
                inputEnabled: false, // Hides the manual calendar date inputs to save layout space
                buttonTheme: {
                    fill: 'rgba(95, 160, 255, 0.08)',
                   stroke: 'rgba(95, 160, 255, 0.24)',
                   style: { color: '#dbe5ff' },
                   states: {
                       hover: { fill: 'rgba(95, 160, 255, 0.2)', style: { color: '#ffffff' } },
                   select: { fill: '#5f9cff', style: { color: '#101d37', fontWeight: 'bold' } }
                   }
                },
                labelStyle: { color: '#8fa5d2' },
                selected: 5 // Default zoom option (All)
            },
            // Enable the mini chart timeline slider beneath the chart window
            navigator: {
                enabled: true,
                maskFill: 'rgba(95, 160, 255, 0.1)',
                   outlineColor: 'rgba(95, 160, 255, 0.25)',
                   handles: { backgroundColor: '#5f9cff', borderColor: '#b5c9ff' },
                   series: { color: '#5f9cff', fillOpacity: 0.05 }
            },
            scrollbar: {
                enabled: false // Hides the tiny scrolling track bar just below the navigator
            },
            xAxis: {
                type: 'datetime',
                crosshair: true,
                labels: {
                    style: { color: '#dbe5ff', fontSize: '11px' },
                    autoRotation: [-30],
                    reserveSpace: false,
                    y: 10,
                    format: '{value:%b %e %H:%M}'
                },
                lineColor: 'rgba(95, 160, 255, 0.24)',
                   tickColor: 'rgba(95, 160, 255, 0.24)'
            },
            yAxis,
            tooltip: {
                shared: true,
                split: false,
                useHTML: true,
                backgroundColor: '#101d37',
                borderColor: '#5f9cff',
                borderRadius: 6,
                style: { color: '#eef6ff', pointerEvents: 'none' },
                headerFormat: '<span style="font-size:0.95em">{point.key}</span><br/>',
                crosshairs: true,
                stickOnContact: false
            },
            legend: {
                enabled: chart.series.length > 1,
                itemStyle: { color: '#dbe5ff' },
                itemHoverStyle: { color: '#b5c9ff' }
            },
            plotOptions: {
                series: {
                    marker: { radius: 3 },
                   stickyTracking: true
                },
                column: {
                    borderRadius: 4,
                   groupPadding: 0,
                   pointPadding: 0,
                   pointPlacement: 'between'
                }
            },
            series: chart.series.map(series => ({
                name: series.label,
                data: series.data,
                type: series.type,
                color: series.color,
                yAxis: series.yAxis ?? 0,
                marker: { enabled: series.type !== 'column' }
            })),
            credits: { enabled: false }
        };

        // Use stockChart if it's available for advanced timelines, fall back to standard charts
        if (typeof Highcharts.stockChart === 'function') {
            Highcharts.stockChart(chart.id, base);
        } else {
            Highcharts.chart(chart.id, base);
        }
    });
}

function resetCharts() {
    state.currentCharts = [];
    chartCounter = 0;
}

function getResourcePath(resource) {
    const pathname = location.pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '');
    const depth = pathname.split('/').filter(Boolean).length;
    return `${'../'.repeat(depth)}${resource}`;
}

async function fetchJson(resource) {
    const url = getResourcePath(resource);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Unable to load ${resource}`);
    return res.json();
}

async function fetchApi(resource, options = {}) {
    const res = await fetch(resource, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`API request failed: ${res.status} ${text}`);
    }
    return res.json();
}

async function fetchBadgeJson(resource) {
    // Get the original path
    const originalPath = getResourcePath(resource);

    // Replace '/games/' with '/games/badges/'
    const url = originalPath.replace('/games/', '/games/badges/');

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Unable to load ${resource} from ${url}`);
    return res.json();
}

function route() {
    const rawPath = location.pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '');
    const path = rawPath || '/';
    if (path === '/' || path === '/index.html') {
        state.indexTab = 'games';
        state.indexSort = { key: 'v', dir: -1 };
        renderIndexPage();
        return;
    }
    if (path === '/add' || path === '/add/index.html') {
        renderAddPage();
        return;
    }
    if (path === '/groups' || path === '/groups/index.html') {
        state.indexTab = 'groups';
        state.indexSort = { key: 'm', dir: -1 };
        renderIndexPage();
        return;
    }
    const segments = path.slice(1).split('/');
    if (segments[0] === 'games' && segments[1]) {
        if (segments[2]) {
            renderBadgePage(segments[1], segments[2]);
        } else {
            renderGamePage(segments[1]);
        }
        return;
    }
    if (segments[0] === 'groups' && segments[1]) {
        renderGroupPage(segments[1]);
        return;
    }
    renderNotFound();
}

function navigate(path) {
    history.pushState(null, '', path);
    route();
}

window.addEventListener('popstate', route);
window.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([loadGames(), loadGroups()]);
    route();
    document.body.addEventListener('click', handleGlobalNav);
});

function handleGlobalNav(event) {
    const anchor = event.target.closest('a[data-nav]');
    if (!anchor) return;
    const url = anchor.getAttribute('href');
    if (!url || url.startsWith('http')) return;
    event.preventDefault();
    navigate(url);
}

async function loadGames() {
    if (state.games) return;
    try {
        state.games = await fetchJson('games_index.json');
        state.games = state.games.map(game => ({
            ...game,
            v24: game.v24 ?? 0
        }));
    } catch (error) {
        state.games = [];
        console.error(error);
    }
}

async function loadGroups() {
    if (state.groups) return;
    try {
        state.groups = await fetchJson('groups_index.json');
    } catch (error) {
        state.groups = [];
        console.error(error);
    }
}

function formatNumber(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return '-';
    return value.toLocaleString();
}

function formatPercent(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return '-';
    return `${value.toFixed(4)}%`;
}

function formatTime(timestamp, options = {}) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        ...options
    });
}

function formatChartLabel(timestamp) {
    const date = new Date(timestamp * 1000);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours();
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hour}:${minute}`;
}

function sortGames(games) {
    const { key, dir } = state.indexSort;
    return [...games].sort((a, b) => {
        const av = a[key] ?? 0;
        const bv = b[key] ?? 0;
        if (av === bv) return a.n.localeCompare(b.n);
        return dir * (av > bv ? 1 : -1);
    });
}

function buildSortButton(field, label) {
    const active = state.indexSort.key === field;
    const arrow = active ? (state.indexSort.dir < 0 ? '▼' : '▲') : '';
    return `<button type="button" onclick="window.__appSort('${field}')">${label} ${arrow}</button>`;
}

window.__appSort = field => {
    state.currentPage = 1;
    if (state.indexSort.key === field) {
        state.indexSort.dir *= -1;
    } else {
        state.indexSort.key = field;
        state.indexSort.dir = -1;
    }
    renderIndexPage();
};

window.__setIndexTab = tab => {
    state.currentPage = 1;
    if (state.indexTab === tab) return;
    state.indexTab = tab;
    state.indexSort = tab === 'groups' ? { key: 'm', dir: -1 } : { key: 'v', dir: -1 };
    navigate(tab === 'groups' ? '/groups' : '/');
};

window.__setPage = pageNum => {
    state.currentPage = pageNum;
    renderIndexPage();
    // Smooth scroll back to top of index table when flipping pages
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

function getIndexSortLabel() {
    const labels = {
        m: 'member count',
        gc: 'game count',
        p: 'player count',
        v: 'visits',
        v24: '24h visit gain',
        l: 'likes',
        d: 'dislikes',
        f: 'favorites',
        r: 'like %'
    };
    return labels[state.indexSort.key] || state.indexSort.key;
}

function renderIndexPage() {
    if (state.indexTab === 'groups') {
        state.addType = null;
        state.addId = '';
        state.addPreview = null;
        state.addError = null;
        state.addStatus = 'idle';
    }
    const items = state.indexTab === 'groups' ? (state.groups || []) : (state.games || []);
    const query = state.searchQuery.trim().toLowerCase();
    const filtered = items.filter(item => !query || item.n.toLowerCase().includes(query));
    const sorted = sortGames(filtered);
    const isGroups = state.indexTab === 'groups';
    const countLabel = isGroups ? 'groups' : 'games';
    const title = isGroups ? 'Group Index' : 'Game Index';
    const emptyMessage = isGroups ? 'No groups found.' : 'No games found.';

    // Pagination parameters
    const itemsPerPage = 100;
    const totalItems = sorted.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

    if (state.currentPage > totalPages) state.currentPage = totalPages;
    if (state.currentPage < 1) state.currentPage = 1;

    const startIndex = (state.currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedItems = sorted.slice(startIndex, endIndex);

    const sortButtons = isGroups
    ? `${buildSortButton('m', 'Members')} ${buildSortButton('gc', 'Games')} ${buildSortButton('p', 'Players')} ${buildSortButton('v', 'Visits')}`
    : `${buildSortButton('p', 'Players')} ${buildSortButton('v', 'Visits')} ${buildSortButton('v24', '24h Visits')} ${buildSortButton('l', 'Likes')} ${buildSortButton('d', 'Dislikes')} ${buildSortButton('f', 'Favorites')} ${buildSortButton('r', 'Like %')}`;

    // Interactive Pagination UI with a manual page type-in input box
    let paginationHtml = '';
    if (totalPages > 1) {
        paginationHtml = `
        <div class="pagination-row" style="display: flex; justify-content: center; align-items: center; gap: 16px; margin-top: 20px; padding: 10px; flex-wrap: wrap;">
        <button type="button" ${state.currentPage === 1 ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''} onclick="window.__setPage(${state.currentPage - 1})">← Previous</button>

        <div style="display: flex; align-items: center; gap: 6px; color: #dbe5ff; font-size: 0.9em;">
        <span>Page</span>
        <input
        type="number"
        min="1"
        max="${totalPages}"
        value="${state.currentPage}"
        style="width: 55px; background: rgba(0,0,0,0.3); border: 1px solid rgba(95, 160, 255, 0.3); color: #fff; text-align: center; padding: 3px; border-radius: 4px;"
        onchange="let p = parseInt(this.value); if(p >= 1 && p <= ${totalPages}) { window.__setPage(p); } else { this.value = state.currentPage; }"
        onkeydown="if(event.key === 'Enter') { let p = parseInt(this.value); if(p >= 1 && p <= ${totalPages}) { window.__setPage(p); } else { this.value = state.currentPage; } }"
        />
        <span>of <strong>${totalPages}</strong></span>
        </div>

        <button type="button" ${state.currentPage === totalPages ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''} onclick="window.__setPage(${state.currentPage + 1})">Next →</button>
        </div>`;
    }

    app.innerHTML = `
    <section class="panel hero-panel">
    <div class="control-row">
    <div>
    <h1>${title}</h1>
    <p class="small-note">Sorted by ${getIndexSortLabel()}. Showing ${startIndex + 1}-${Math.min(endIndex, totalItems)} of ${totalItems}.</p>
    </div>
    <input id="searchInput" type="search" placeholder="Filter ${countLabel} by name..." value="${escapeHtml(state.searchQuery)}" />
    </div>
    <div class="tab-menu">
    <button class="${state.indexTab === 'games' ? 'active' : ''}" onclick="window.__setIndexTab('games')">Games</button>
    <button class="${state.indexTab === 'groups' ? 'active' : ''}" onclick="window.__setIndexTab('groups')">Groups</button>
    </div>
    <div class="control-row">
    <div class="badge-pill">${totalItems} ${countLabel}</div>
    <div>${sortButtons}</div>
    </div>
    </section>
    <section class="panel table-shell">
    ${paginatedItems.length ? `
        <table>
        <thead>
        ${isGroups ? `
            <tr>
            <th>Group</th>
            <th>Members</th>
            <th>Games</th>
            <th>Players</th>
            <th>Visits</th>
            </tr>
            ` : `
            <tr>
            <th>Game</th>
            <th>Players</th>
            <th>Visits</th>
            <th>24h Gain</th>
            <th>Likes</th>
            <th>Dislikes</th>
            <th>Favorites</th>
            <th>Like %</th>
            </tr>
            `}
            </thead>
            <tbody>
            ${paginatedItems.map(item => isGroups ? `
                <tr>
                <td><a data-nav="true" href="${getResourcePath(`groups/${item.id}/`)}">${escapeHtml(item.n)}</a></td>
                <td>${formatNumber(item.m)}</td>
                <td>${formatNumber(item.gc)}</td>
                <td>${formatNumber(item.p)}</td>
                <td>${formatNumber(item.v)}</td>
                </tr>
                ` : `
                <tr>
                <td><a data-nav="true" href="${getResourcePath(`games/${item.id}/`)}">${escapeHtml(item.n)}</a></td>
                <td>${formatNumber(item.p)}</td>
                <td>${formatNumber(item.v)}</td>
                <td>${formatNumber(item.v24)}</td>
                <td>${formatNumber(item.l)}</td>
                <td>${formatNumber(item.d)}</td>
                <td>${formatNumber(item.f)}</td>
                <td>${formatPercent(item.r)}</td>
                </tr>
                `).join('')}
                </tbody>
                </table>
                ${paginationHtml}
                ` : `<p class="small-note">${emptyMessage}</p>`}
                </section>
                `;

                const searchInput = document.getElementById('searchInput');
                searchInput.addEventListener('input', event => {
                    state.searchQuery = event.target.value;
                    state.currentPage = 1; // Reset to page 1 on search filter change
                    renderIndexPage();
                });

                // Maintain cursor focus at the end of input text across re-renders
                if (document.activeElement?.id !== 'searchInput') {
                    searchInput.focus();
                    searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
                }
}

function escapeHtml(value) {
    return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderAddPage() {
    const canAdd = state.addPreview && !state.addPreview.alreadyAdded;
    const isLoaded = state.addStatus === 'loading';
    const hasAdded = state.addStatus === 'added';
    app.innerHTML = `
    <section class="panel hero-panel">
    <div class="control-row">
    <div>
    <a class="link-button" data-nav="true" href="/">← Back to home</a>
    </div>
    <div class="badge-pill">Add Game or Group</div>
    </div>
    <div>
    <h1>Add content to the tracker</h1>
    <p class="small-note">Choose a type, validate it, and append it to ${state.addType === 'game' ? 'the games list' : state.addType === 'group' ? 'the groups list' : 'the database'}.</p>
    </div>
    </section>
    <section class="panel table-shell">
    ${!state.addType ? `
        <div class="control-row">
        <button type="button" class="addbutton" onclick="window.__startAdd('game')">Add Game</button>
        <button type="button" class="addbutton" onclick="window.__startAdd('group')">Add Group</button>
        </div>
        ` : `
        <div class="control-row">
        <button type="button" onclick="window.__resetAdd()">Choose a different type</button>
        </div>
        <div class="control-row">
        <label>${state.addType === 'game' ? 'Place ID' : 'Group ID'}</label>
        <input id="addIdInput" type="text" placeholder="Enter ID..." value="${escapeHtml(state.addId)}" oninput="window.__setAddId(this.value)" />
        <button type="button" onclick="window.__fetchAddPreview()" ${isLoaded ? 'disabled' : ''}>${isLoaded ? 'Looking up…' : 'Lookup'}</button>
        </div>
        ${state.addError ? `<p class="small-note" style="color:#ff8c8c">${escapeHtml(state.addError)}</p>` : ''}
        ${state.addPreview ? `
            <div class="chart-frame">
            <h2>Preview</h2>
            <p class="small-note">${escapeHtml(state.addPreview.description || '')}</p>
            <table class="preview-table">
            <tbody>
            <tr><th>Name</th><td>${escapeHtml(state.addPreview.name)}</td></tr>
            ${state.addType === 'group' ? `<tr><th>Members</th><td>${formatNumber(state.addPreview.memberCount)}</td></tr><tr><th>Games</th><td>${formatNumber(state.addPreview.gamesCount)}</td></tr>` : ''}
            ${state.addType === 'game' ? `<tr><th>Universe</th><td>${formatNumber(state.addPreview.universeId)}</td></tr><tr><th>Creator</th><td>${escapeHtml(state.addPreview.creatorName || 'Unknown')}</td></tr><tr><th>Players</th><td>${formatNumber(state.addPreview.playing)}</td></tr><tr><th>Favorites</th><td>${formatNumber(state.addPreview.favoritedCount)}</td></tr>` : ''}
            </tbody>
            </table>
            ${state.addType === 'group' && state.addPreview.games?.length ? `
                <div class="small-note">Games in group: ${escapeHtml(state.addPreview.games.map(g => g.name).slice(0, 6).join(', '))}${state.addPreview.games.length > 6 ? '...' : ''}</div>
                ` : ''}
                <div class="control-row" style="margin-top:16px; gap:12px; flex-wrap:wrap;">
                <button type="button" onclick="window.__confirmAdd()" ${canAdd ? '' : 'disabled'}>${state.addPreview.alreadyAdded ? 'Already added' : 'Add'}</button>
                ${hasAdded ? `<button type="button" onclick="window.__resetAdd()">Add another</button>` : ''}
                </div>
                </div>
                ` : ''}
                `}
                </section>
                ${hasAdded ? `
                    <section class="panel table-shell">
                    <p class="small-note">Successfully added. You can go back home or add another item.</p>
                    <div class="control-row" style="gap:12px; flex-wrap:wrap;">
                    <button type="button" onclick="window.__goHome()">Home</button>
                    <button type="button" onclick="window.__resetAdd()">Add another</button>
                    </div>
                    </section>
                    ` : ''}
                    `;
}

window.__startAdd = type => {
    state.addType = type;
    state.addId = '';
    state.addPreview = null;
    state.addError = null;
    state.addStatus = 'idle';
    renderAddPage();
};

window.__setAddId = value => {
    state.addId = value;
};

window.__resetAdd = () => {
    state.addType = null;
    state.addId = '';
    state.addPreview = null;
    state.addError = null;
    state.addStatus = 'idle';
    renderAddPage();
};

window.__goHome = () => {
    navigate('/');
};

window.__fetchAddPreview = async () => {
    if (!state.addType || !state.addId.trim()) {
        state.addError = 'Enter a valid ID to continue.';
        renderAddPage();
        return;
    }

    state.addError = null;
    state.addPreview = null;
    state.addStatus = 'loading';
    renderAddPage();

    try {
        if (state.addType === 'group') {
            state.addPreview = await fetchApi(`/api/group/${encodeURIComponent(state.addId.trim())}`);
        } else {
            state.addPreview = await fetchApi(`/api/place/${encodeURIComponent(state.addId.trim())}`);
        }
        state.addStatus = 'ready';
    } catch (error) {
        state.addError = error.message;
        state.addPreview = null;
        state.addStatus = 'error';
    }
    renderAddPage();
};

window.__confirmAdd = async () => {
    if (!state.addPreview || state.addPreview.alreadyAdded) return;
    state.addStatus = 'loading';
    renderAddPage();

    try {
        if (state.addType === 'group') {
            await fetchApi('/api/groups', {
                method: 'POST',
                body: JSON.stringify({ id: state.addPreview.id })
            });
        } else {
            await fetchApi('/api/games', {
                method: 'POST',
                body: JSON.stringify({ universeId: state.addPreview.universeId })
            });
        }
        state.addPreview.alreadyAdded = true;
        state.addStatus = 'added';
    } catch (error) {
        state.addError = error.message;
        state.addStatus = 'error';
    }
    renderAddPage();
};

async function renderGamePage(gameId) {
    resetCharts();
    const game = state.games.find(item => String(item.id) === String(gameId));
    let meta = null;
    let history = null;
    let badges = null;
    try {
        meta = await fetchJson(`games/${gameId}/metadata.json`);
    } catch (error) {
        renderError(`Game metadata not found for ${gameId}.`);
        return;
    }
    const previousGameId = state.currentGameId;
    state.currentGameId = gameId;
    if (previousGameId !== gameId) {
        state.gameHistoryMode = 'auto';
    }

    const defaultFiles = ['latest.json', '10m.json', '30m.json', '1h.json'];
    let autoHistory = null;
    let dailyHistory = null;
    let dailyExists = false;
    let otherExists = false;

    for (const file of defaultFiles) {
        try {
            const data = await fetchJson(`games/${gameId}/${file}`);
            if (Array.isArray(data) && data.length) {
                autoHistory = data;
                otherExists = true;
                break;
            }
        } catch {
            continue;
        }
    }

    try {
        const data = await fetchJson(`games/${gameId}/1d.json`);
        if (Array.isArray(data) && data.length) {
            dailyHistory = data;
            dailyExists = true;
        }
    } catch {
        dailyHistory = null;
    }

    if (state.gameHistoryMode === 'daily' && dailyExists) {
        history = dailyHistory;
    } else if (autoHistory) {
        history = autoHistory;
    } else if (dailyHistory) {
        history = dailyHistory;
    }

    if (!history) {
        renderError('No history data available for this game.');
        return;
    }

    try {
        badges = await fetchJson(`games/${gameId}/badges/index.json`);
    } catch {
        badges = [];
    }

    let prevVisits = 0, prevFavs = 0, prevLikes = 0, prevDislikes = 0, prevPlayers = 0;
    const points = history.slice().filter(point => point && typeof point.time === 'number').map((point, index) => {
        const cleaned = { ...point };
        if (index === 0) {
            prevVisits = cleaned.visits || 0;
            prevFavs = cleaned.favorites || 0;
            prevLikes = cleaned.likes || 0;
            prevDislikes = cleaned.dislikes || 0;
            prevPlayers = cleaned.players || 0;
            return cleaned;
        }

        // If values drop to 0 at random, retain the previous interval value
        if ((cleaned.visits === 0 || !cleaned.visits) && prevVisits) cleaned.visits = prevVisits; else prevVisits = cleaned.visits || 0;
        if ((cleaned.favorites === 0 || !cleaned.favorites) && prevFavs) cleaned.favorites = prevFavs; else prevFavs = cleaned.favorites || 0;
        if ((cleaned.likes === 0 || !cleaned.likes) && prevLikes) cleaned.likes = prevLikes; else prevLikes = cleaned.likes || 0;
        if ((cleaned.dislikes === 0 || !cleaned.dislikes) && prevDislikes) cleaned.dislikes = prevDislikes; else prevDislikes = cleaned.dislikes || 0;
        if ((cleaned.players === 0 || !cleaned.players) && prevPlayers) cleaned.players = prevPlayers; else prevPlayers = cleaned.players || 0;

        // Re-calculate ratio if likes/dislikes were corrected
        if ((cleaned.likes + cleaned.dislikes) > 0) {
            cleaned.ratio = (cleaned.likes / (cleaned.likes + cleaned.dislikes)) * 100;
        }

        return cleaned;
    });
    if (!points.length) {
        renderError('No usable history points were found for this game.');
        return;
    }
    const visitGain = points.map((point, index) => index === 0 ? 0 : Math.max(0, (point.visits || 0) - (points[index - 1].visits || 0)));
    const likesGain = points.map((point, index) => index === 0 ? 0 : (point.likes || 0) - (points[index - 1].likes || 0));
    const dislikesGain = points.map((point, index) => index === 0 ? 0 : (point.dislikes || 0) - (points[index - 1].dislikes || 0));
    const favGain = points.map((point, index) => index === 0 ? 0 : Math.max(0, (point.favorites || 0) - (points[index - 1].favorites || 0)));

    const normalizeGain = (values, points) => values.map((value, index) => {
        if (index === 0) return 0;

        // If the tracker is in daily history mode, return the raw daily gain value directly
        if (state.gameHistoryMode === 'daily') return value;

        const delta = points[index].time - points[index - 1].time;
        if (delta <= 600) return value;
        const divisor = delta / 600;
        return Math.round(value / divisor);
    });

    const visitGainNorm = normalizeGain(visitGain, points);
    const likesGainNorm = normalizeGain(likesGain, points);
    const dislikesGainNorm = normalizeGain(dislikesGain, points);
    const favGainNorm = normalizeGain(favGain, points);

    const current = points[points.length - 1];
    const playersText = formatNumber(current.players || meta.playing || 0);
    const visitsText = formatNumber(current.visits || meta.visits || 0);
    const likesText = formatNumber(current.likes || 0);
    const dislikesText = formatNumber(current.dislikes || 0);
    const favoritesText = formatNumber(current.favorites || meta.favorites || 0);
    const ratioText = formatPercent(current.ratio ?? meta.ratio ?? 0);

    const playersSeries = points.map(point => [point.time * 1000, point.players || 0]);
    const visitsSeries = points.map(point => [point.time * 1000, point.visits || 0]);
    const likesSeries = points.map(point => [point.time * 1000, point.likes || 0]);
    const dislikesSeries = points.map(point => [point.time * 1000, point.dislikes || 0]);
    const favoritesSeries = points.map(point => [point.time * 1000, point.favorites || 0]);
    const ratioSeries = points.map(point => [point.time * 1000, point.ratio || 0]);
    const visitGainSeries = points.map((point, index) => [point.time * 1000, visitGainNorm[index]]);
    const likesGainSeries = points.map((point, index) => [point.time * 1000, likesGainNorm[index]]);
    const dislikesGainSeries = points.map((point, index) => [point.time * 1000, dislikesGainNorm[index]]);
    const favGainSeries = points.map((point, index) => [point.time * 1000, favGainNorm[index]]);

    app.innerHTML = `
    <section class="panel hero-panel">
    <div class="control-row">
    <div>
    <a class="link-button" data-nav="true" href="../../">← Back to games</a>
    </div>
    <div class="badge-pill">Universe ${escapeHtml(gameId)}</div>
    </div>
    <div>
    <h1>${escapeHtml(meta.name || game?.n || 'Unknown Game')}</h1>
    <p class="small-note">${escapeHtml(meta.description || 'No description available.')}</p>
    </div>
    <div class="stat-grid">
    <div class="stat-card"><strong>${playersText}</strong><span>Players</span></div>
    <div class="stat-card"><strong>${visitsText}</strong><span>Visits</span></div>
    <div class="stat-card"><strong>${likesText}</strong><span>Likes</span></div>
    <div class="stat-card"><strong>${dislikesText}</strong><span>Dislikes</span></div>
    <div class="stat-card"><strong>${favoritesText}</strong><span>Favorites</span></div>
    <div class="stat-card"><strong>${ratioText}</strong><span>Like %</span></div>
    </div>
    <p class="status-line"></p>
    </section>
    <section class="panel chart-panel">
    <div class="tab-menu">
    <button class="${state.activeTab === 'trends' ? 'active' : ''}" onclick="window.__setGameTab('trends')">Trends</button>
    <button class="${state.activeTab === 'badges' ? 'active' : ''}" onclick="window.__setGameTab('badges')">Badges</button>
    ${dailyExists && otherExists ? `<button class="${state.gameHistoryMode === 'daily' ? 'active' : ''}" onclick="window.__setGameHistoryMode('${state.gameHistoryMode === 'daily' ? 'auto' : 'daily'}')">${state.gameHistoryMode === 'daily' ? 'Recent' : 'Daily'}</button>` : ''}
    </div>
    ${state.activeTab === 'trends' ? `
        <div class="chart-grid">
        ${renderChartPanel('Players', [{ label: 'Players', data: playersSeries, color: colors[0] }])}
        ${renderLineBarPanel('Visits', '', visitsSeries, visitGainSeries, colors[0], colors[2], 'Visits', 'Gain')}
        ${renderChartPanel('Likes + Dislikes', [{ label: 'Likes', data: likesSeries, color: colors[1] }, { label: 'Dislikes', data: dislikesSeries, color: colors[3] }])}
        ${renderBarPanel('Like Change + Dislike Change', [{ label: 'Likes change', data: likesGainSeries, color: colors[1] }, { label: 'Dislikes change', data: dislikesGainSeries, color: colors[3] }])}
        ${renderLineBarPanel('Favorites', '', favoritesSeries, favGainSeries, colors[1], colors[2], 'Favorites', 'Gain')}
        ${renderChartPanel('Like %', [{ label: 'Like %', data: ratioSeries, color: colors[0] }])}
        </div>
        ` : renderBadgesTable(gameId, badges)}
        </section>
        `;
        window.requestAnimationFrame(() => drawCharts(state.currentCharts));
}

window.__setGameTab = tab => {
    state.activeTab = tab;
    route();
};

window.__setGameHistoryMode = mode => {
    state.gameHistoryMode = mode;
    if (state.currentGameId) {
        renderGamePage(state.currentGameId);
    }
};

function renderBadgesTable(gameId, badges) {
    if (!Array.isArray(badges) || !badges.length) {
        return `<div class="chart-frame"><p class="small-note">Theres most likely no badges for this game :P</p></div>`;
    }
    const rows = badges.map(badge => `
    <tr>
    <td><a data-nav="true" href="./${badge.id}">${escapeHtml(badge.n)}</a></td>
    <td>${formatNumber(badge.total)}</td>
    <td>${badge.win ? formatPercent(badge.win * 100) : '-'}</td>
    </tr>
    `).join('');
    return `
    <div class="chart-frame">
    <div class="status-line">Badge listing sorted by index order. Click a badge to view detailed history.</div>
    <table class="badge-table">
    <thead>
    <tr>
    <th>Name</th>
    <th>Awarded Count</th>
    <th>Win Rate</th>
    </tr>
    </thead>
    <tbody>${rows}</tbody>
    </table>
    </div>
    `;
}

async function renderBadgePage(gameId, badgeId) {
    let badgeIndex;
    let badgeMeta;
    let badgeHistory;
    try {
        badgeIndex = await fetchJson(`games/${gameId}/badges/index.json`);
        badgeMeta = badgeIndex.find(item => String(item.id) === String(badgeId));
    } catch {
        badgeMeta = null;
    }
    if (!badgeMeta) {
        renderError('Badge metadata not found.');
        return;
    }
    try {
        badgeHistory = await fetchJson(`games/${gameId}/badges/${badgeId}.json`);
    } catch {
        renderError('Badge history file not found.');
        return;
    }
    if (!Array.isArray(badgeHistory) || !badgeHistory.length) {
        renderError('Badge history is empty.');
        return;
    }
    const points = badgeHistory.map(point => ({
        time: point.t,
        total: point.total || 0,
        awarded: point.a || 0
    }));
    const totalSeries = points.map(point => [point.time * 1000, point.total]);
    const awardedSeries = points.map(point => [point.time * 1000, point.awarded]);
    resetCharts();
    app.innerHTML = `
    <section class="panel hero-panel">
    <div class="control-row">
    <div>
    <a class="link-button" data-nav="true" href="../${gameId}/">← Back to game</a>
    </div>
    <div class="badge-pill">Badge ${escapeHtml(String(badgeId))}</div>
    </div>
    <div>
    <h1>${escapeHtml(badgeMeta.n)}</h1>
    <p class="small-note">${escapeHtml(badgeMeta.d || 'No description available.')}</p>
    </div>
    <div class="stat-grid">
    <div class="stat-card"><strong>${formatNumber(badgeMeta.total)}</strong><span>Total Awarded</span></div>
    <div class="stat-card"><strong>${badgeMeta.win ? formatPercent(badgeMeta.win * 100) : '-'}</strong><span>Win Chance</span></div>
    </div>
    </section>
    <section class="panel chart-panel">
    <div class="chart-grid">
    ${renderLineBarPanel('Badge Awards', 'Total awarded and awards received in the latest interval', totalSeries, awardedSeries, colors[0], colors[2], 'Total', 'Recently awarded')}
    </div>
    </section>
    `;
    window.requestAnimationFrame(() => drawCharts(state.currentCharts));
}

async function renderGroupPage(groupId) {
    resetCharts();
    let metadata = null;
    let history = null;
    try {
        metadata = await fetchJson(`groups/${groupId}/metadata.json`);
    } catch (error) {
        renderError(`Group metadata not found for ${groupId}.`);
        return;
    }
    try {
        history = await fetchJson(`groups/${groupId}/1d.json`);
    } catch (error) {
        renderError('No history data available for this group.');
        return;
    }
    if (!Array.isArray(history) || !history.length) {
        renderError('No usable history points were found for this group.');
        return;
    }

    const points = history.slice().filter(point => point && typeof point.t === 'number');
    if (!points.length) {
        renderError('No usable history points were found for this group.');
        return;
    }

    const memberSeries = points.map(point => [point.t * 1000, point.m || 0]);
    const playerSeries = points.map(point => [point.t * 1000, point.p || 0]);
    const visitSeries = points.map(point => [point.t * 1000, point.v || 0]);
    const memberGainSeries = points.map((point, index) => [point.t * 1000, index === 0 ? 0 : Math.max(0, (point.m || 0) - (points[index - 1].m || 0))]);
    const playerGainSeries = points.map((point, index) => [point.t * 1000, index === 0 ? 0 : Math.max(0, (point.p || 0) - (points[index - 1].p || 0))]);
    const visitGainSeries = points.map((point, index) => [point.t * 1000, index === 0 ? 0 : Math.max(0, (point.v || 0) - (points[index - 1].v || 0))]);

    const latest = points[points.length - 1];
    const playersText = formatNumber(latest.p);
    const visitsText = formatNumber(latest.v);
    const membersText = formatNumber(latest.m || metadata.memberCount || 0);
    const gamesText = formatNumber((metadata.games || []).length);

    const gameDetails = await Promise.all((metadata.games || []).map(async game => {
        let gameMeta = null;
        try {
            gameMeta = await fetchJson(`games/${game.id}/metadata.json`);
        } catch {
            gameMeta = null;
        }
        const indexEntry = state.games?.find(item => String(item.id) === String(game.id));
        return {
            id: game.id,
            name: gameMeta?.name || game.n || `Game ${game.id}`,
            players: gameMeta?.playing ?? 0,
            visits: gameMeta?.visits ?? 0,
            favorites: gameMeta?.favorites ?? gameMeta?.favoritedCount ?? 0,
            v24: indexEntry?.v24 ?? gameMeta?.v24 ?? 0
        };
    }));

    const gameRows = gameDetails.map(game => `
    <tr>
    <td><a data-nav="true" href="${getResourcePath('games/' + game.id)}">${escapeHtml(game.name)}</a></td>
    <td>${formatNumber(game.players)}</td>
    <td>${formatNumber(game.visits)}</td>
    <td>${formatNumber(game.v24)}</td>
    </tr>
    `).join('');

    app.innerHTML = `
    <section class="panel hero-panel">
    <div class="control-row">
    <div>
    <a class="link-button" data-nav="true" href="${getResourcePath('groups')}">← Back to groups</a>
    </div>
    <div class="badge-pill">Group ${escapeHtml(String(groupId))}</div>
    </div>
    <div>
    <h1>${escapeHtml(metadata.name || `Group ${groupId}`)}</h1>
    <p class="small-note">${escapeHtml(metadata.description || 'No description available.')}</p>
    </div>
    <div class="stat-grid">
    <div class="stat-card"><strong>${membersText}</strong><span>Members</span></div>
    <div class="stat-card"><strong>${gamesText}</strong><span>Tracked Games</span></div>
    <div class="stat-card"><strong>${playersText}</strong><span>Total Players</span></div>
    <div class="stat-card"><strong>${visitsText}</strong><span>Total Visits</span></div>
    </div>
    <p class="status-line">Showing trend data for the group and its tracked games.</p>
    </section>
    <section class="panel chart-panel">
    <div class="chart-grid">
    ${renderLineBarPanel('Members', 'Member total plus daily change', memberSeries, memberGainSeries, colors[0], colors[2], 'Members', 'Gain')}
    ${renderChartPanel('Total Players', [{ label: 'Players', data: playerSeries, color: colors[1] }])}
    ${renderChartPanel('Total Visits', [{ label: 'Visits', data: visitSeries, color: colors[2] }])}
    </div>
    </section>
    <section class="panel table-shell">
    <h2>Tracked Games</h2>
    ${gameRows ? `
        <table>
        <thead>
        <tr>
        <th>Game</th>
        <th>Players</th>
        <th>Visits</th>
        <th>24h V Gain</th>
        </tr>
        </thead>
        <tbody>${gameRows}</tbody>
        </table>
        ` : `<p class="small-note">No tracked game matches were found in the game index.</p>`}
        </section>
        `;
        window.requestAnimationFrame(() => drawCharts(state.currentCharts));
}

function renderNotFound() {
    app.innerHTML = `
    <section class="panel hero-panel">
    <h1>Page not found</h1>
    <p class="small-note">We couldn't resolve that route. Try returning to the game index.</p>
    <a class="cta-button" data-nav="true" href="./">Back to index</a>
    </section>
    `;
}

function renderError(message) {
    app.innerHTML = `
    <section class="panel hero-panel">
    <h1>Error</h1>
    <p class="small-note">${escapeHtml(message)}</p>
    <a class="cta-button" data-nav="true" href="./">Back to index</a>
    </section>
    `;
}

function renderChartPanel(title, datasets) {
    const chartId = getChartId('chart');
    state.currentCharts.push({
        id: chartId,
        title,
        series: datasets.map(series => ({
            label: series.label,
            data: series.data,
            color: series.color,
            type: 'line',
            yAxis: 0
        }))
    });
    return `
    <article class="chart-frame">
    <div>
    <h2>${escapeHtml(title)}</h2>
    </div>
    <div id="${chartId}" class="chart-canvas"></div>
    </article>
    `;
}

function getPointRange(data) {
    if (!Array.isArray(data) || data.length < 2) return 0;
    return Math.max(...data.slice(1).map((point, index) => {
        const current = point[0];
        const prev = data[index][0];
        return current - prev;
    }));
}

function renderLineBarPanel(title, subtitle, lineData, barData, lineColor, barColor, lineLabel, barLabel) {
    const chartId = getChartId('chart');
    const barRange = getPointRange(barData) || getPointRange(lineData);
    state.currentCharts.push({
        id: chartId,
        title,
        yAxis: [
            { title: { text: null }, labels: { style: { color: '#dbe5ff' } }, gridLineColor: 'rgba(255,255,255,0.08)' },
                             { title: { text: null }, labels: { style: { color: '#dbe5ff' } }, opposite: true }
        ],
        series: [
            { label: lineLabel, data: lineData, color: lineColor, type: 'line', yAxis: 0 },
            { label: barLabel, data: barData, color: barColor, type: 'column', yAxis: 1, pointRange: barRange }
        ]
    });
    return `
    <article class="chart-frame">
    <div>
    <h2>${escapeHtml(title)}</h2>
    <p class="small-note">${escapeHtml(subtitle)}</p>
    </div>
    <div id="${chartId}" class="chart-canvas"></div>
    </article>
    `;
}

function renderBarPanel(title, barData) {
    const chartId = getChartId('chart');
    state.currentCharts.push({
        id: chartId,
        title,
        series: barData.map(bar => ({
            label: bar.label,
            data: bar.data,
            color: bar.color,
            type: 'column',
            yAxis: 0
        }))
    });
    return `
    <article class="chart-frame">
    <div>
    <h2>${escapeHtml(title)}</h2>
    </div>
    <div id="${chartId}" class="chart-canvas"></div>
    </article>
    `;
}

function renderSvgChart({ labels, datasets = [], bars = [] }) {
    if ((!datasets.length && !bars.length) || !labels.length) {
        return '<div class="small-note">No chart data available.</div>';
    }
    const values = [
        ...datasets.flatMap(series => series.values),
        ...bars.flatMap(series => series.values)
    ].filter(v => typeof v === 'number');
    const minValue = Math.min(0, ...values);
    const maxValue = Math.max(...values, 1);
    const height = 260;
    const width = 760;
    const padding = { left: 44, right: 18, top: 24, bottom: 42 };
    const range = maxValue - minValue || 1;
    const points = labels.length;
    const xStep = points > 1 ? (width - padding.left - padding.right) / (points - 1) : 1;
    const yScale = value => height - padding.bottom - ((value - minValue) / range) * (height - padding.top - padding.bottom);
    const baseline = yScale(0);
    const gridLines = [0, 1, 2, 3, 4].map(index => ({
        y: yScale(minValue + range * (4 - index) / 4),
                                                    label: formatNumber(minValue + range * (4 - index) / 4)
    }));
    const stepLabel = Math.max(1, Math.floor(points / 6));
    const labelNodes = labels.map((label, index) => {
        if (index % stepLabel !== 0 && index !== points - 1) return '';
        return `<text x="${padding.left + xStep * index}" y="${height - 16}" class="axis-label" text-anchor="middle">${escapeHtml(label)}</text>`;
    }).join('');
    const linePaths = datasets.map((dataset, index) => {
        const path = dataset.values.map((value, idx) => {
            const x = padding.left + xStep * idx;
            const y = yScale(value ?? minValue);
            return `${idx === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
        }).join(' ');
        return `<path d="${path}" fill="none" stroke="${dataset.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    }).join('');
    const barGroups = bars.map((bar, seriesIndex) => {
        const widthUnit = Math.max(10, xStep * 0.35);
        return bar.values.map((value, index) => {
            const x = padding.left + xStep * index - widthUnit / 2 + seriesIndex * (widthUnit + 2) - ((bars.length - 1) * (widthUnit + 2) / 2);
            const y = yScale(Math.max(value, 0));
            const heightValue = Math.abs(baseline - yScale(value));
            return `<rect x="${x.toFixed(2)}" y="${Math.min(y, baseline).toFixed(2)}" width="${widthUnit.toFixed(2)}" height="${heightValue.toFixed(2)}" fill="${bar.color}" rx="3"/>`;
        }).join('');
    }).join('');

    const legendNodes = [
        ...datasets.map((series, index) => `<span class="color-${index + 1}">${escapeHtml(series.label)}</span>`),
        ...bars.map((series, index) => `<span class="color-${datasets.length + index + 1}">${escapeHtml(series.label)}</span>`)
    ].join('');

    return `
    <div class="chart-frame-inner">
    <svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
    <g stroke="rgba(255,255,255,0.06)" stroke-width="1">
    ${gridLines.map(line => `<line x1="${padding.left}" y1="${line.y.toFixed(2)}" x2="${width - padding.right}" y2="${line.y.toFixed(2)}"/>`).join('')}
    </g>
    <g fill="none" stroke="#4c5f8f" stroke-width="1" opacity="0.5">
    ${gridLines.map(line => `<text x="10" y="${line.y + 4}" fill="#8fa5d2" font-size="11">${escapeHtml(line.label)}</text>`).join('')}
    </g>
    ${linePaths}
    ${barGroups}
    <line x1="${padding.left}" y1="${baseline.toFixed(2)}" x2="${width - padding.right}" y2="${baseline.toFixed(2)}" stroke="rgba(95, 160, 255, 0.18)" stroke-width="1" />
    ${labelNodes}
    </svg>
    <div class="chart-legend">${legendNodes}</div>
    </div>
    `;
}
