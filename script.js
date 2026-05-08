// ===== ГЛОБАЛЬНІ ЗМІННІ =====
let activeAnime = null;
let activeSzn = null;
const malCache = {};
let top100Loaded = false;
let top100Cache = JSON.parse(localStorage.getItem('top100Cache')) || null;

// ===== ЗАВАНТАЖЕННЯ ПОСТЕРІВ =====
async function loadPosters() {
    const imgs = document.querySelectorAll('img[data-anilist]');
    if (imgs.length === 0) {
        console.error("Не знайдено зображень з data-anilist!");
        return;
    }

    const ids = Array.from(imgs).map(img => parseInt(img.dataset.anilist));
    const query = `query ($ids: [Int]) {
        Page { media(id_in: $ids, type: ANIME) {
            id coverImage { extraLarge large }
        }}
    }`;

    try {
        const res = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables: { ids } })
        });
        const data = await res.json();
        const mediaList = data.data?.Page?.media || [];

        imgs.forEach(img => {
            const id = parseInt(img.dataset.anilist);
            const media = mediaList.find(m => m.id === id);
            if (media) {
                img.src = media.coverImage?.extraLarge || media.coverImage?.large || "https://via.placeholder.com/300x400?text=No+Poster";
            } else {
                img.src = "https://via.placeholder.com/300x400?text=No+Poster";
            }
            img.onerror = function() {
                this.src = "https://via.placeholder.com/300x400?text=No+Poster";
            };
        });
    } catch (e) {
        console.error('Помилка завантаження постерів:', e);
        imgs.forEach(img => {
            img.src = "https://via.placeholder.com/300x400?text=No+Poster";
        });
    }
}

// ===== ПОШУК =====
function doSearch(query) {
    const q = query.trim().toLowerCase();
    const homeScreen = document.getElementById('homeScreen');
    const searchResults = document.getElementById('searchResults');
    const playerScreen = document.getElementById('playerScreen');

    // Якщо запит порожній — повертаємося на головну
    if (!q) {
        searchResults.style.display = 'none';
        searchResults.innerHTML = '';
        homeScreen.style.display = 'grid';
        playerScreen.style.display = 'none';
        return;
    }

    // Ховаємо головну і плеєр, показуємо результати пошуку
    homeScreen.style.display = 'none';
    playerScreen.style.display = 'none';
    searchResults.style.display = 'grid';
    searchResults.innerHTML = '';

    // Шукаємо серед карток на головній
    const cards = document.querySelectorAll('#homeScreen .anime-card');
    let found = 0;
    cards.forEach(card => {
        const title = card.querySelector('h3').innerText.toLowerCase();
        const desc = card.querySelector('p').innerText.toLowerCase();
        if (title.includes(q) || desc.includes(q)) {
            const clone = card.cloneNode(true);
            searchResults.appendChild(clone);
            // Відновлюємо обробник подій
            const onclick = card.getAttribute('onclick');
            clone.setAttribute('onclick', onclick);
            found++;
        }
    });

    if (found === 0) {
        searchResults.innerHTML = `<div class="search-none">😔 Нічого не знайдено за запитом «${query.trim()}»</div>`;
    }
}

// ===== ГОЛОВНА СТОРІНКА =====
function showHome() {
    document.getElementById('homeScreen').style.display = 'grid';
    document.getElementById('playerScreen').style.display = 'none';
    document.getElementById('searchResults').style.display = 'none';
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('searchInput').value = '';
    document.getElementById('mainPlayer').src = '';
}

// ===== ВІДКРИТТЯ АНІМЕ =====
function openAnime(id) {
    activeAnime = id;
    document.getElementById('homeScreen').style.display = 'none';
    document.getElementById('searchResults').style.display = 'none';
    document.getElementById('playerScreen').style.display = 'block';
    document.getElementById('animeTitle').innerText = ANIME_DATA[id].name;

    const tabs = document.getElementById('seasonTabs');
    tabs.innerHTML = '';
    const seasonNames = Object.keys(ANIME_DATA[id].seasons);

    // Визначаємо збережений прогрес
    const saved = localStorage.getItem('tracker_' + id);
    let savedSzn = null, savedEp = null;
    if (saved) {
        const m = saved.match(/^(.+) — Серія (\d+)$/);
        if (m) { savedSzn = m[1]; savedEp = m[2]; }
    }

    // Додаємо кнопки сезонів
    seasonNames.forEach((sn, idx) => {
        const btn = document.createElement('button');
        btn.className = 'szn-btn' + (idx === 0 ? ' active' : '');
        btn.innerText = sn;
        if (savedSzn === sn) btn.classList.add('has-progress');
        btn.onclick = () => loadSeason(sn);
        tabs.appendChild(btn);
    });

    // Відкриваємо перший сезон або збережений
    const startSzn = (savedSzn && ANIME_DATA[id].seasons[savedSzn]) ? savedSzn : seasonNames[0];
    loadSeason(startSzn, savedSzn === startSzn ? savedEp : null);
    loadMalData(id, startSzn);
    loadTracker();
    loadFandomWiki(id);
}

// ===== ЗАВАНТАЖЕННЯ СЕЗОНУ =====
function loadSeason(szn, savedEp) {
    activeSzn = szn;
    document.querySelectorAll('.szn-btn').forEach(b => {
        b.classList.toggle('active', b.innerText === szn);
    });

    const grid = document.getElementById('episodesGrid');
    grid.innerHTML = '';
    const episodes = ANIME_DATA[activeAnime].seasons[szn];

    // Визначаємо поточний прогрес, якщо savedEp не передано
    if (!savedEp) {
        const saved = localStorage.getItem('tracker_' + activeAnime);
        if (saved) {
            const m = saved.match(/^(.+) — Серія (\d+)$/);
            if (m && m[1] === szn) savedEp = m[2];
        }
    }

    // Додаємо серії
    for (let num in episodes) {
        const isFilm = isNaN(num);
        if (isFilm) continue;

        const item = document.createElement('div');
        item.className = 'ep-item';
        item.innerText = num;
        if (savedEp && String(num) === String(savedEp)) {
            item.classList.add('watched');
        }
        item.onclick = () => {
            document.querySelectorAll('.ep-item').forEach(i => i.classList.remove('active'));
            document.querySelectorAll('.film-btn').forEach(b => b.classList.remove('active'));
            item.classList.add('active');
            document.getElementById('mainPlayer').src = episodes[num];
            autoSaveTracker(szn, num);
            // Оновити зелені полоски
            document.querySelectorAll('.ep-item').forEach(i => i.classList.remove('watched'));
            item.classList.add('watched');
            // Оновити крапку на кнопці сезону
            document.querySelectorAll('.szn-btn').forEach(b => {
                b.classList.toggle('has-progress', b.innerText === szn);
            });
        };
        grid.appendChild(item);
    }

    // Додаємо фільми (якщо є)
    const filmSection = document.getElementById('filmSection');
    filmSection.innerHTML = '';
    filmSection.style.display = 'none';
    const filmKeys = Object.keys(episodes).filter(k => isNaN(k));
    if (filmKeys.length > 0) {
        filmSection.style.display = 'block';
        filmKeys.forEach(fk => {
            const btn = document.createElement('button');
            btn.className = 'film-btn';
            btn.innerHTML = `🎬 <span>${fk}</span>`;
            btn.onclick = () => {
                document.querySelectorAll('.ep-item').forEach(i => i.classList.remove('active'));
                document.querySelectorAll('.film-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById('mainPlayer').src = episodes[fk];
            };
            filmSection.appendChild(btn);
        });
    }

    // Відкриваємо першу серію
    const firstEp = Object.keys(episodes).find(k => !isNaN(k));
    if (firstEp) {
        document.getElementById('mainPlayer').src = episodes[firstEp];
        if (grid.firstChild) grid.firstChild.classList.add('active');
    }

    // Оновлюємо MAL при зміні сезону
    if (activeAnime) {
        const sznIds = ANIME_DATA[activeAnime].season_mal_ids;
        const sznMalId = sznIds && sznIds[szn] ? sznIds[szn] : ANIME_DATA[activeAnime].mal_id;
        loadMalData(activeAnime, szn, sznMalId);
    }
}

// ===== ZAВАНТАЖЕННЯ ДАНИХ З MAL =====
async function loadMalData(id, szn, overrideMalId) {
    const sznIds = ANIME_DATA[id]?.season_mal_ids;
    const mal_id = overrideMalId || (sznIds && sznIds[szn] ? sznIds[szn] : ANIME_DATA[id]?.mal_id);

    if (!mal_id) {
        document.getElementById('animeDesc').innerText = 'Опис недоступний.';
        return;
    }

    // Перевіряємо кеш
    if (malCache[mal_id]) {
        applyMalData(malCache[mal_id], mal_id);
        return;
    }

    try {
        document.getElementById('animeDesc').innerText = 'Завантаження...';
        const res = await fetch(`https://api.jikan.moe/v4/anime/${mal_id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        malCache[mal_id] = data.data;
        applyMalData(data.data, mal_id);
    } catch (error) {
        console.error("Помилка завантаження MAL:", error);
        document.getElementById('animeDesc').innerText = 'Не вдалося завантажити дані з MAL.';
        document.getElementById('malScore').innerText = '—';
    }
}

function applyMalData(data, mal_id) {
    const score = data.score ?? '—';
    const members = data.members ? (data.members / 1000).toFixed(0) + 'K оцінок' : '';
    const rank = data.rank ? '#' + data.rank : '';

    document.getElementById('malScore').innerText = '⭐ ' + score;
    document.getElementById('malMembers').innerText = members;
    document.getElementById('malLink').href = `https://myanimelist.net/anime/${mal_id}`;

    const badge = document.getElementById('malRankBadge');
    if (rank) {
        badge.innerHTML = `Місце в топі<span>${rank}</span>`;
    }

    if (data.synopsis) {
        const cleaned = data.synopsis.replace(/\[Written by MAL Rewrite\]/g, '').trim();
        document.getElementById('animeDesc').innerText = cleaned;
    } else {
        document.getElementById('animeDesc').innerText = 'Опис відсутній.';
    }
}

// ===== ТРЕКЕР СЕРІЙ =====
function getTrackerKey() { return 'tracker_' + activeAnime; }

function autoSaveTracker(szn, epNum) {
    const val = `${szn} — Серія ${epNum}`;
    localStorage.setItem(getTrackerKey(), val);
    renderTracker(val);
}

function loadTracker() {
    const saved = localStorage.getItem(getTrackerKey());
    renderTracker(saved);
}

function renderTracker(val) {
    const el = document.getElementById('trackerCurrent');
    if (val) {
        el.innerHTML = '<span>' + escHtml(val) + '</span>';
    } else {
        el.innerText = 'Ще не починав(ла)';
    }
}

// ===== FANDOM WIKI =====
function loadFandomWiki(id) {
    const url = ANIME_DATA[id]?.fandom_url;
    const name = ANIME_DATA[id]?.name || '';
    const link = document.getElementById('fandomLink');
    const nameEl = document.getElementById('fandomLinkName');
    if (url) {
        link.href = url;
        nameEl.innerText = name + ' — Fandom Wiki';
    } else {
        link.href = `https://www.fandom.com/search?q=${encodeURIComponent(name)}`;
        nameEl.innerText = 'Знайти вікі для ' + name;
    }
}

// ===== ТОП-100 =====
async function openTop100() {
    document.getElementById('top100Modal').classList.add('open');
    const body = document.getElementById('top100Body');

    // Якщо кеш є, використовуємо його
    if (top100Cache) {
        renderTop100(top100Cache);
        return;
    }

    if (top100Loaded) return;

    try {
        body.innerHTML = '<div class="top-loading">⏳ Завантаження рейтингу...</div>';

        const all = [];
        for (let page = 1; page <= 4; page++) {
            if (page > 1) await new Promise(resolve => setTimeout(resolve, 400));
            const res = await fetch(`https://api.jikan.moe/v4/top/anime?limit=25&page=${page}&type=tv`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const d = await res.json();
            all.push(...d.data);
            body.innerHTML = `<div class="top-loading">Завантажено ${all.length} з 100...</div>`;
        }

        top100Cache = all.slice(0, 100);
        localStorage.setItem('top100Cache', JSON.stringify(top100Cache));
        renderTop100(top100Cache);
        top100Loaded = true;
    } catch (e) {
        body.innerHTML = `
            <div class="top-loading">
                😔 Помилка: ${e.message}<br><br>
                <button onclick="top100Loaded=false;openTop100()"
                    style="background:var(--glam-red);color:#fff;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-family:Montserrat,sans-serif;">
                    🔄 Спробувати знову
                </button>
            </div>
        `;
    }
}

function renderTop100(data) {
    const body = document.getElementById('top100Body');
    body.innerHTML = '';
    data.forEach((anime, i) => {
        const rank = i + 1;
        let rankClass = '';
        if (rank === 1) rankClass = 'gold';
        else if (rank === 2) rankClass = 'silver';
        else if (rank === 3) rankClass = 'bronze';

        const item = document.createElement('div');
        item.className = 'top-item';
        item.innerHTML = `
            <div class="top-rank ${rankClass}">${rank}</div>
            <img class="top-img" src="${anime.images?.jpg?.image_url || 'https://via.placeholder.com/44x62?text=No+Img'}" alt="${anime.title}" loading="lazy">
            <div class="top-info">
                <div class="top-title">${anime.title}</div>
                <div class="top-score">⭐ ${anime.score ?? 'N/A'} &nbsp;·&nbsp; ${anime.type ?? ''} &nbsp;·&nbsp; ${anime.episodes ? anime.episodes + ' еп.' : '?'}</div>
            </div>
        `;
        body.appendChild(item);
    });
}

function closeTop100() {
    document.getElementById('top100Modal').classList.remove('open');
}

// ===== ДОПОМІЖНІ ФУНКЦІЇ =====
function escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Закривання модального вікна при кліку на оверлей
document.getElementById('top100Modal').addEventListener('click', function(e) {
    if (e.target === this) closeTop100();
});

// Кнопка "Наверх"
window.addEventListener('scroll', function() {
    const btn = document.getElementById('scrollToTop');
    if (window.scrollY > 300) {
        btn.style.display = 'block';
    } else {
        btn.style.display = 'none';
    }
});

document.getElementById('scrollToTop').addEventListener('click', function() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Завантажувач
window.addEventListener('load', function() {
    setTimeout(() => {
        document.getElementById('loadingOverlay').style.display = 'none';
    }, 500);
});

// Завантажуємо постери при завантаженні сторінки
loadPosters();
