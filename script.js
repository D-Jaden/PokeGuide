const API_URL = 'https://pokeapi.co/api/v2';
let allPokemonData = [];
let cachedPokemonDetails = {};
if (typeof sessionStorage !== 'undefined') {
    try {
        cachedPokemonDetails = JSON.parse(sessionStorage.getItem('gridCache') || '{}');
    } catch (e) {
        cachedPokemonDetails = {};
    }
}
let currentGeneration = 'all';
let isSearching = false;
let currentRenderId = 0;

const generationRanges = {
    1: { start: 1, end: 151 },
    2: { start: 152, end: 251 },
    3: { start: 252, end: 386 },
    4: { start: 387, end: 493 },
    5: { start: 494, end: 649 },
    6: { start: 650, end: 721 },
    7: { start: 722, end: 809 },
    8: { start: 810, end: 905 },
    9: { start: 906, end: 1025 },
    'Forms': { start: 10001, end: 10300 }
};

async function fetchPokemonList() {
    try {
        const response = await fetch(`${API_URL}/pokemon?limit=10000&offset=0`);
        const data = await response.json();
        
        allPokemonData = data.results.map((poke) => {
            const urlParts = poke.url.split('/');
            const id = parseInt(urlParts[urlParts.length - 2]);
            return {
                ...poke,
                id: id
            };
        });
        
        setupEventListeners();
        // Removed await loadGeneration('1') to prevent overwriting region grids
    } catch (error) {
        console.error('Error fetching Pokémon:', error);
        document.getElementById('pokemonGrid').innerHTML = 
            '<div class="loading">Error loading Pokémon. Please try again.</div>';
    }
}

async function loadGeneration(gen) {
    const grid = document.getElementById('pokemonGrid');
    if (grid) grid.innerHTML = '<div class="loading">Loading Pokémon...</div>';
    
    currentGeneration = gen;
    isSearching = false;
    
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('exploreMode', 'gen');
        sessionStorage.setItem('exploreValue', gen);
    }
    
    let toLoad = [];
    if (gen === 'all') {
        toLoad = allPokemonData.slice(0, 151); // Load Gen 1 for "All" initially to prevent extreme lag
    } else {
        const range = generationRanges[parseInt(gen)];
        toLoad = allPokemonData.slice(range.start - 1, range.end);
    }
    
    await fetchAndRender(toLoad);
}

async function fetchAndRender(pokemonList) {
    const grid = document.getElementById('pokemonGrid');
    if (!grid) return;
    
    const chunkSize = 20;
    const renderId = ++currentRenderId;
    
    grid.innerHTML = '';
    
    if (pokemonList.length === 0) {
        grid.innerHTML = '<div class="loading">No Pokémon found.</div>';
        return;
    }

    for (let i = 0; i < pokemonList.length; i += chunkSize) {
        if (renderId !== currentRenderId) return;

        const chunk = pokemonList.slice(i, i + chunkSize);
        const toFetch = chunk.filter(p => !cachedPokemonDetails[p.id]);
        
        const skeletonHtml = Array(chunk.length).fill(`
            <div class="pokemon-card skeleton-card">
                <div class="skeleton-img-area"></div>
                <div class="skeleton-pill-row">
                    <div class="skeleton-pill"></div>
                    <div class="skeleton-pill"></div>
                </div>
                <div class="skeleton-desc-area"></div>
            </div>
        `).join('');
        
        const tempSkeletonsContainer = document.createElement('div');
        tempSkeletonsContainer.className = 'skeleton-container';
        tempSkeletonsContainer.style.display = 'contents';
        tempSkeletonsContainer.innerHTML = skeletonHtml;
        grid.appendChild(tempSkeletonsContainer);
        
        if (toFetch.length > 0) {
            try {
                const details = await Promise.all(
                    toFetch.map(async (poke) => {
                        const [pokeRes, speciesRes] = await Promise.all([
                            fetch(poke.url),
                            fetch(`https://pokeapi.co/api/v2/pokemon-species/${poke.id}`).catch(() => null)
                        ]);
                        
                        const data = await pokeRes.json();
                        
                        try {
                            if (speciesRes && speciesRes.ok) {
                                data.speciesData = await speciesRes.json();
                            }
                        } catch (e) {
                            console.error("Failed to fetch species for", data.name);
                        }
                        
                        const lightData = {
                            id: data.id,
                            name: data.name,
                            types: data.types,
                            sprites: { front_default: data.sprites?.front_default || '' },
                            speciesData: data.speciesData
                        };
                        
                        return lightData;
                    })
                );
                details.forEach(d => cachedPokemonDetails[d.id] = d);
                
                if (typeof sessionStorage !== 'undefined') {
                    try {
                        sessionStorage.setItem('gridCache', JSON.stringify(cachedPokemonDetails));
                    } catch (e) {
                        // Ignore quota exceeded
                    }
                }
            } catch (err) {
                console.error("Failed fetching detail chunk", err);
            }
        }
        
        if (grid.contains(tempSkeletonsContainer)) {
            grid.removeChild(tempSkeletonsContainer);
        }
        
        const chunkDetails = chunk.map(p => cachedPokemonDetails[p.id]).filter(d => d);
        
        const html = chunkDetails.map(renderSingleCard).join('');
        grid.insertAdjacentHTML('beforeend', html);
    }
}

function renderSingleCard(pokemon) {
    const types = pokemon.types.map(t => t.type.name);
    const mainType = types[0];
    
    let description = 'A mysterious Pokémon with untold potential and power.';
    if (pokemon.speciesData && pokemon.speciesData.flavor_text_entries) {
        const entry = pokemon.speciesData.flavor_text_entries.find(e => e.language.name === 'en');
        if (entry) description = entry.flavor_text.replace(/\n|\f/g, ' ');
    } else {
        description = getRandomDescription(pokemon.name);
    }
    
    const hp = pokemon.stats[0].base_stat;
    const gen = getGenFromId(pokemon.id);
    
    return `
        <div class="pokemon-card custom-pokemon-card" onclick="goToDetail(${pokemon.id})">
            <div class="card-image-area">
                <div class="gen-badge-custom">Pokemon Gen ${gen}</div>
                <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokemon.id}.png" 
                     alt="${pokemon.name}" onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png'">
            </div>
            <div class="card-badges-row">
                <div class="custom-pill name-pill">${formatPokemonName(pokemon.name)}</div>
                <div class="custom-pill type-pill type-${mainType}">${mainType.charAt(0).toUpperCase() + mainType.slice(1)}</div>
            </div>
            <div class="card-desc-box">
                <div class="hp-tab">Pokemon Hp ${hp}</div>
                <span class="desc-title">Pokemon Desc</span>
                <div class="desc-content">${description}</div>
            </div>
            <button class="custom-view-btn">View Evolutions</button>
        </div>
    `;
}

function getGenFromId(id) {
    for (const [gen, range] of Object.entries(generationRanges)) {
        if (id >= range.start && id <= range.end) return gen;
    }
    return '?';
}

function formatPokemonName(name) {
    let parts = name.split('-');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    
    const base = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    
    const prefixes = ['mega', 'alola', 'galar', 'hisui', 'paldea', 'gmax'];
    const prefixMap = {
        'alola': 'Alolan',
        'galar': 'Galarian',
        'hisui': 'Hisuian',
        'paldea': 'Paldean',
        'gmax': 'Gigantamax',
        'mega': 'Mega'
    };
    
    for (const p of prefixes) {
        if (parts[1] === p) {
            let prefixName = prefixMap[p];
            let extra = parts.slice(2).join(' ').toUpperCase();
            if (extra) {
                return `${prefixName} ${base} ${extra}`;
            }
            return `${prefixName} ${base}`;
        }
    }
    
    const form = parts.slice(1).join(' ');
    let formattedForm = form.charAt(0).toUpperCase() + form.slice(1);
    return `${base} (${formattedForm})`;
}



function getRandomDescription(name) {
    const descriptions = {
        bulbasaur: 'A strange seed was planted on its back. The plant sprouts and grows with this Pokémon.',
        ivysaur: 'When the bulb on its back grows large, it appears to lose the ability to stand on its hind legs.',
        venusaur: 'The plant blooms when it is absorbing solar energy. It stays on the move to seek sunlight.',
        charmander: 'The flame on its tail shows the strength of its life force. If it is weak, the flame also burns weakly.',
        charmeleon: 'Known as the "Flame Pokémon" since ancient times, it is a hot-blooded Pokémon that uses its sharp fangs and claws.',
        charizard: 'It spits fire that is hot enough to melt boulders. Known to cause forest fires unintentionally.',
        squirtle: 'It hides in its shell when it senses danger. It can remain withdrawn into its shell for days.',
        wartortle: 'It tucks itself inside its shell to recover from injuries. It can detect nearby enemies by the flow of water.',
        blastoise: 'The jets of water it forcefully ejects from the shells on its body are powerful enough to pierce holes.',
    };
    
    return descriptions[name.toLowerCase()] || 'A mysterious Pokémon with untold potential and power.';
}

function setupEventListeners() {
    const genButtons = document.querySelectorAll('.gen-btn');
    genButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            genButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadGeneration(btn.dataset.gen);
        });
    });
    
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    
    if (searchInput && searchBtn) {
        searchBtn.addEventListener('click', performSearch);
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performSearch();
        });
    }
    
    const randomBtn = document.getElementById('randomBtn');
    if (randomBtn) {
        randomBtn.addEventListener('click', getRandomPokemon);
    }
}

async function performSearch() {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput.value.toLowerCase().trim();
    const filterSelect = document.getElementById('searchFilter');
    const filter = filterSelect ? filterSelect.value : 'name';
    
    if (!query) {
        loadGeneration(currentGeneration);
        return;
    }
    
    isSearching = true;
    const grid = document.getElementById('pokemonGrid');
    if (grid) grid.innerHTML = '<div class="loading">Searching...</div>';
    
    let matching = [];

    try {
        if (filter === 'name') {
            matching = allPokemonData.filter(p => 
                p.name.toLowerCase().includes(query) || 
                p.name.replace(/-/g, ' ').includes(query) ||
                formatPokemonName(p.name).toLowerCase().includes(query) ||
                p.id.toString() === query
            );
        } else if (filter === 'generation') {
            let targetGen = query.replace('gen ', '').replace('generation ', '');
            const genMap = { 'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9 };
            let genNum = parseInt(targetGen);
            if (isNaN(genNum) && genMap[targetGen]) genNum = genMap[targetGen];
            
            if (genNum && generationRanges[genNum]) {
                const range = generationRanges[genNum];
                matching = allPokemonData.filter(p => p.id >= range.start && p.id <= range.end);
            } else {
                matching = allPokemonData.filter(p => getGenFromId(p.id).toString().toLowerCase() === query);
            }
        } else if (filter === 'type') {
            const res = await fetch(`${API_URL}/type/${query}`);
            if (res.ok) {
                const data = await res.json();
                const pokeNames = data.pokemon.map(p => p.pokemon.name);
                matching = allPokemonData.filter(p => pokeNames.includes(p.name));
            }
        } else if (filter === 'ability') {
            const queryAbility = query.replace(' ', '-');
            const res = await fetch(`${API_URL}/ability/${queryAbility}`);
            if (res.ok) {
                const data = await res.json();
                const pokeNames = data.pokemon.map(p => p.pokemon.name);
                matching = allPokemonData.filter(p => pokeNames.includes(p.name));
            }
        }
    } catch (e) {
        console.error("Search error", e);
    }
    
    fetchAndRender(matching.slice(0, 50));
}

function getRandomPokemon() {
    const random = allPokemonData[Math.floor(Math.random() * allPokemonData.length)];
    if (random) goToDetail(random.id);
}

function goToDetail(pokemonId) {
    window.location.href = `detail.html?id=${pokemonId}`;
}

async function loadPokemonDetail(id) {
    try {
        const response = await fetch(`${API_URL}/pokemon/${id}`);
        const pokemon = await response.json();
        
        const speciesResponse = await fetch(pokemon.species.url);
        const speciesData = await speciesResponse.json();
        
        const evolutionResponse = await fetch(speciesData.evolution_chain.url);
        const evolutionData = await evolutionResponse.json();
        
        if (pokemon.moves.length === 0 && speciesData && speciesData.varieties) {
            const defaultVariety = speciesData.varieties.find(v => v.is_default);
            if (defaultVariety && defaultVariety.pokemon.name !== pokemon.name) {
                try {
                    const defaultRes = await fetch(defaultVariety.pokemon.url);
                    const defaultPoke = await defaultRes.json();
                    pokemon.moves = defaultPoke.moves;
                } catch (e) {
                    console.error("Failed fetching fallback moves:", e);
                }
            }
        }
        
        displayPokemonDetail(pokemon, speciesData, evolutionData);
    } catch (error) {
        console.error('Error loading Pokémon detail:', error);
    }
}

function displayPokemonDetail(pokemon, speciesData, evolutionData) {
    document.getElementById('pokemonName').textContent = formatPokemonName(pokemon.name);
    
    document.getElementById('pokemonImage').src = 
        pokemon.sprites.other['official-artwork'].front_default || 
        pokemon.sprites.front_default;
    
    const genBadge = document.getElementById('genBadge');
    if (genBadge) {
        const gen = getGenFromId(pokemon.id);
        const genText = (gen === 'Forms' || gen === '?') ? 'VARIANT' : `GEN ${gen.toString().toUpperCase()}`;
        genBadge.textContent = genText;
    }
    
    const types = pokemon.types.map(t => t.type.name);
    document.getElementById('typeBadges').innerHTML = 
        types.map(type => `<span class="type-badge type-${type}">${type}</span>`).join('');
    
    const description = speciesData.flavor_text_entries
        .find(e => e.language.name === 'en')?.flavor_text?.replace(/\n|\f/g, ' ') || 
        'A mysterious Pokémon.';
    document.getElementById('pokemonDescription').textContent = description;
    
    let genus = 'Pokémon';
    if (speciesData && speciesData.genera) {
        const enGenus = speciesData.genera.find(g => g.language.name === 'en');
        if (enGenus) genus = enGenus.genus;
    }
    
    let preEvoName = null;
    if (evolutionData && evolutionData.chain && speciesData) {
        preEvoName = getPreEvolution(evolutionData.chain, speciesData.name);
    }
    
    setupTTS(formatPokemonName(pokemon.name), genus, description, preEvoName);
    
    document.getElementById('pokemonHeight').textContent = 
        (pokemon.height / 10).toFixed(1) + ' m';
    document.getElementById('pokemonWeight').textContent = 
        (pokemon.weight / 10).toFixed(1) + ' kg';
    document.getElementById('pokemonHp').textContent = 
        pokemon.stats[0].base_stat;
    
    displayEvolution(evolutionData.chain);
    displayStats(pokemon.stats, pokemon.id > 10000);
    displayAbilities(pokemon.abilities);
    displayMoves(pokemon.moves);
    fetchAndDisplayEffectiveness(pokemon.types);
    if (speciesData && speciesData.varieties) {
        displayForms(speciesData.varieties, pokemon.name);
    }
}

function displayForms(varieties, currentName) {
    const formsSection = document.getElementById('formsSection');
    const alternativeForms = document.getElementById('alternativeForms');
    
    if (!formsSection || !alternativeForms) return;
    
    if (!varieties || varieties.length <= 1) {
        formsSection.style.display = 'none';
        return;
    }
    
    formsSection.style.display = 'block';
    
    let html = '';
    varieties.forEach(v => {
        const urlParts = v.pokemon.url.split('/');
        const pokeId = urlParts[urlParts.length - 2];
        const pokeName = formatPokemonName(v.pokemon.name);
        
        html += `
            <div class="evolution-item" onclick="goToDetail(${pokeId})" ${v.pokemon.name === currentName ? 'style="border: 2px solid var(--primary); border-radius: 12px; padding: 5px;"' : ''}>
                <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokeId}.png" 
                     alt="${pokeName}" onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokeId}.png'">
                <div class="evo-name">${pokeName}</div>
            </div>
        `;
    });
    
    alternativeForms.innerHTML = html;
}

function getPreEvolution(chain, targetName) {
    let preEvo = null;
    
    function traverse(node, previousName) {
        if (node.species.name === targetName) {
            preEvo = previousName;
            return;
        }
        for (let next of node.evolves_to) {
            traverse(next, node.species.name);
        }
    }
    
    traverse(chain, null);
    return preEvo;
}

function displayEvolution(chain) {
    const evolutionChain = document.getElementById('evolutionChain');
    let html = '';
    let current = chain;
    
    while (current) {
        const pokeName = formatPokemonName(current.species.name);
        const pokeId = current.species.url.split('/')[6];
        
        html += `
            <div class="evolution-item" onclick="goToDetail(${pokeId})">
                <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokeId}.png" 
                     alt="${pokeName}" onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokeId}.png'">
                <div class="evo-name">${pokeName}</div>
            </div>
        `;
        
        if (current.evolves_to.length > 0) {
            html += '<div class="evolution-arrow">→</div>';
            current = current.evolves_to[0];
        } else {
            current = null;
        }
    }
    
    evolutionChain.innerHTML = html;
}

function displayStats(stats, isAlternate = false) {
    const statNames = ['HP', 'ATK', 'DEF', 'SPA', 'SPD', 'SPE'];
    const statsBars = document.getElementById('statsBars');
    
    statsBars.innerHTML = stats.map((stat, index) => {
        const percentage = (stat.base_stat / 150) * 100;
        return `
            <div class="stat-bar">
                <div class="stat-bar-name">${statNames[index]}</div>
                <div class="stat-bar-fill">
                    <div class="stat-bar-progress ${isAlternate ? 'alternate-form' : ''}" style="width: ${percentage}%"></div>
                </div>
                <div class="stat-bar-value">${stat.base_stat}</div>
            </div>
        `;
    }).join('');
}

function displayAbilities(abilities) {
    const abilitiesList = document.getElementById('abilities');
    abilitiesList.innerHTML = abilities.map(a => 
        `<div class="ability-tag">${a.ability.name.replace('-', ' ')}</div>`
    ).join('');
}

function displayMoves(moves) {
    const movesGrid = document.getElementById('movesGrid');
    const topMoves = moves.slice(0, 12);
    
    movesGrid.innerHTML = topMoves.map(moveData => {
        const moveName = moveData.move.name.replace('-', ' ');
        return `
            <div class="move-card">
                <div class="move-name">${moveName}</div>
                <div class="move-info">
                    <span class="move-power">PWR</span>
                    <span class="move-accuracy">ACC</span>
                </div>
            </div>
        `;
    }).join('');
}

if (document.getElementById('pokemonGrid')) {
    const dataFetchPromise = fetchPokemonList();
    simulateLoading(async () => {
        await dataFetchPromise;
        initializeLandingScreen();
    });
}

function initializeLandingScreen() {
    const btnExploreGen = document.getElementById('btnExploreGen');
    const btnExploreRegion = document.getElementById('btnExploreRegion');
    const landingScreen = document.getElementById('landingScreen');
    const regionSelectionScreen = document.getElementById('regionSelectionScreen');
    const mainAppContent = document.getElementById('mainAppContent');
    const btnBackFromRegion = document.getElementById('btnBackFromRegion');
    
    if(!btnExploreGen) return;

    const mode = sessionStorage.getItem('exploreMode');
    const value = sessionStorage.getItem('exploreValue');

    if (mode === 'gen') {
        landingScreen.style.display = 'none';
        mainAppContent.style.display = 'block';
        const title = document.querySelector('.pokemon-title');
        if (title) title.textContent = 'ALL POKÉMON';
        const genFilter = document.querySelector('.generation-filter');
        if (genFilter) genFilter.style.display = 'flex';
        loadGeneration(value || '1');
    } else if (mode === 'region') {
        landingScreen.style.display = 'none';
        loadRegionalPokedex(value || 'kanto');
    }

    btnExploreGen.addEventListener('click', () => {
        landingScreen.style.display = 'none';
        mainAppContent.style.display = 'block';
        
        const title = document.querySelector('.pokemon-title');
        if (title) title.textContent = 'ALL POKÉMON';
        
        const genFilter = document.querySelector('.generation-filter');
        if (genFilter) genFilter.style.display = 'flex';
        
        if (!currentGeneration) {
            loadGeneration('1');
        } else if (isSearching) {
            loadGeneration(currentGeneration);
        }
    });
    
    btnExploreRegion.addEventListener('click', () => {
        landingScreen.style.display = 'none';
        regionSelectionScreen.style.display = 'flex';
    });
    
    if (btnBackFromRegion) {
        btnBackFromRegion.addEventListener('click', () => {
            regionSelectionScreen.style.display = 'none';
            landingScreen.style.display = 'flex';
        });
    }
    
    const regionCards = document.querySelectorAll('.region-card');
    regionCards.forEach(card => {
        card.addEventListener('click', () => {
            const region = card.getAttribute('data-region');
            loadRegionalPokedex(region);
        });
    });
    
    const homeLogo = document.getElementById('homeLogo');
    if (homeLogo) {
        homeLogo.addEventListener('click', () => {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.removeItem('exploreMode');
                sessionStorage.removeItem('exploreValue');
            }
            location.reload();
        });
    }
}

const regionPokedexMap = {
    'kanto': 2,
    'johto': 3,
    'hoenn': 4,
    'sinnoh': 5,
    'unova': 8,
    'kalos': 12,
    'alola': 16,
    'galar': 27,
    'paldea': 31
};

async function loadRegionalPokedex(region) {
    const regionSelectionScreen = document.getElementById('regionSelectionScreen');
    const mainAppContent = document.getElementById('mainAppContent');
    
    regionSelectionScreen.style.display = 'none';
    mainAppContent.style.display = 'block';
    
    const title = document.querySelector('.pokemon-title');
    if (title) title.textContent = `${region.toUpperCase()} REGIONAL POKÉDEX`;
    
    document.querySelectorAll('.gen-btn').forEach(btn => btn.classList.remove('active'));
    
    const genFilter = document.querySelector('.generation-filter');
    if (genFilter) genFilter.style.display = 'none';
    
    const grid = document.getElementById('pokemonGrid');
    if (grid) grid.innerHTML = '<div class="loading">Loading Regional Pokédex...</div>';
    
    isSearching = true; // prevents infinite scroll appending wrong gen data
    
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('exploreMode', 'region');
        sessionStorage.setItem('exploreValue', region);
    }
    
    try {
        const pokedexId = regionPokedexMap[region];
        if (!pokedexId) throw new Error("Unknown region");
        
        const response = await fetch(`${API_URL}/pokedex/${pokedexId}`);
        const data = await response.json();
        
        let toLoad = [];
        data.pokemon_entries.forEach(entry => {
            const speciesName = entry.pokemon_species.name;
            const poke = allPokemonData.find(p => p.name === speciesName || p.name.startsWith(speciesName + '-'));
            if (poke) {
                if(!toLoad.find(p => p.name === poke.name)) {
                    toLoad.push(poke);
                }
            }
        });
        
        await fetchAndRender(toLoad);
    } catch (error) {
        console.error("Error loading regional pokedex", error);
        if (grid) grid.innerHTML = '<div class="error">Failed to load region data.</div>';
    }
}

function simulateLoading(callback) {
    const loaderProgress = document.getElementById('loaderProgress');
    const globalLoader = document.getElementById('globalLoader');
    const runningPokemon = document.getElementById('runningPokemon');
    
    if (!loaderProgress || !globalLoader) {
        if(callback) callback();
        return;
    }

    if (runningPokemon) {
        // Gen 1 to Gen 5 (1 - 649) have animated sprites in this API directory
        const randomId = Math.floor(Math.random() * 649) + 1;
        runningPokemon.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${randomId}.gif`;
    }

    let progress = 0;
    const interval = setInterval(() => {
        // Grow slowly to take around 2.5 seconds to reach 90%
        progress += Math.random() * 4 + 2;
        if (progress > 90) progress = 90;
        
        loaderProgress.style.width = `${progress}%`;
    }, 150);

    if(callback) {
        // Enforce a minimum delay of 2.5 seconds to show the animation
        Promise.all([
            callback(),
            new Promise(resolve => setTimeout(resolve, 2500))
        ]).then(() => {
            clearInterval(interval);
            loaderProgress.style.width = `100%`;
            setTimeout(() => {
                globalLoader.classList.add('hidden');
                setTimeout(() => {
                    globalLoader.style.display = 'none';
                    window.dispatchEvent(new Event('loaderFinished'));
                }, 500);
            }, 400);
        });
    }
}

function setupTTS(pokemonName, genus, description, preEvoName) {
    const ttsBtn = document.getElementById('ttsButton');
    if (!ttsBtn) return;
    
    const newBtn = ttsBtn.cloneNode(true);
    ttsBtn.parentNode.replaceChild(newBtn, ttsBtn);
    
    let textToSpeak = '';
    if (preEvoName) {
        textToSpeak = `${pokemonName}, a ${genus} that evolves from ${formatPokemonName(preEvoName)}... ${description}`;
    } else {
        textToSpeak = `${pokemonName}, a ${genus}... ${description}`;
    }
    
    if ('speechSynthesis' in window) {
        window.speechSynthesis.getVoices();
    }
    
    newBtn.addEventListener('click', () => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            
            setTimeout(() => {
                const msg = new SpeechSynthesisUtterance(textToSpeak);
                
                const voices = window.speechSynthesis.getVoices();
                
                // For debugging: log available voices so the user can see their options
                // console.log(voices.map(v => v.name));
                
                if (voices.length > 0) {
                    // Aggressively search for male voices
                    let preferred = voices.find(v => 
                        v.lang.startsWith('en') && (
                            v.name.toLowerCase().includes('male') ||
                            v.name.toLowerCase().includes('david') ||
                            v.name.toLowerCase().includes('mark') ||
                            v.name.toLowerCase().includes('daniel') ||
                            v.name.toLowerCase().includes('arthur')
                        )
                    );
                    
                    // If no explicit "male" voice is found, check for espeak which defaults to a robotic male on Linux
                    if (!preferred) {
                        preferred = voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('espeak'));
                    }
                    
                    if (preferred) {
                        msg.voice = preferred;
                    } else {
                        // For debugging: output available voices so the user can find a male one
                        console.warn("No default male voice found. Available voices:", voices.map(v => v.name));
                    }
                }
                
                msg.lang = 'en-US';
                // Slowed down slightly for clarity and informative tone
                msg.rate = 0.9; 
                // Pitch slightly lowered for an authoritative narrator voice
                msg.pitch = 0.9; 
                
                window.speechSynthesis.speak(msg);
            }, 50);
        } else {
            alert('Text-to-Speech is not supported in your browser.');
        }
    });
}

const weatherTerrainMap = {
    fire: [
        { name: 'Harsh Sunlight', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>', effect: 'Boosts Fire-type moves by 50%.' },
        { name: 'Rain', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2"><path d="M16 13v8M8 13v8M12 15v8M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>', effect: 'Weakens Fire-type moves by 50%.' }
    ],
    water: [
        { name: 'Rain', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2"><path d="M16 13v8M8 13v8M12 15v8M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>', effect: 'Boosts Water-type moves by 50%.' },
        { name: 'Harsh Sunlight', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>', effect: 'Weakens Water-type moves by 50%.' }
    ],
    electric: [
        { name: 'Electric Terrain', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#FBBF24" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>', effect: 'Boosts Electric-type moves by 30% and prevents Sleep.' }
    ],
    grass: [
        { name: 'Grassy Terrain', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2"><path d="M12 20v-8m0 0l4-4m-4 4l-4-4m8 8c0 1.1-.9 2-2 2H8c-1.1 0-2-.9-2-2v-4c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2v4z"/></svg>', effect: 'Boosts Grass-type moves by 30% and heals HP each turn.' }
    ],
    psychic: [
        { name: 'Psychic Terrain', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#EC4899" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>', effect: 'Boosts Psychic-type moves by 30% and blocks priority moves.' }
    ],
    dragon: [
        { name: 'Misty Terrain', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#A78BFA" stroke-width="2"><path d="M17.5 19c2.485 0 4.5-2.015 4.5-4.5S19.985 10 17.5 10c-1.393 0-2.637.636-3.465 1.632A5 5 0 0 0 6 13a4.5 4.5 0 0 0 .5 8.973M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41"/></svg>', effect: 'Weakens Dragon-type moves by 50% and prevents status conditions.' }
    ],
    ice: [
        { name: 'Snow/Hail', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#93C5FD" stroke-width="2"><path d="M12 3v18M3 12h18M5.636 5.636l12.728 12.728M18.364 5.636L5.636 18.364M8 12h8"/></svg>', effect: 'Boosts Defense of Ice-types by 50% (Snow) and prevents Hail damage.' }
    ],
    rock: [
        { name: 'Sandstorm', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2"><path d="M12 2v20m-7-3h14M5 7h14m-3 7h3m-8-4h8M4 14h4"/></svg>', effect: 'Boosts Sp. Def of Rock-types by 50% and prevents Sandstorm damage.' }
    ],
    ground: [
        { name: 'Sandstorm', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2"><path d="M12 2v20m-7-3h14M5 7h14m-3 7h3m-8-4h8M4 14h4"/></svg>', effect: 'Immune to Sandstorm damage.' }
    ],
    steel: [
        { name: 'Sandstorm', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2"><path d="M12 2v20m-7-3h14M5 7h14m-3 7h3m-8-4h8M4 14h4"/></svg>', effect: 'Immune to Sandstorm damage.' }
    ]
};

async function fetchAndDisplayEffectiveness(pokemonTypes) {
    try {
        const typePromises = pokemonTypes.map(t => fetch(t.type.url).then(res => res.json()));
        const typesData = await Promise.all(typePromises);
        
        calculateAndRenderDefensive(typesData);
        calculateAndRenderOffensive(typesData);
        renderWeatherTerrain(pokemonTypes.map(t => t.type.name));
    } catch (e) {
        console.error("Error fetching type effectiveness data", e);
    }
}

function calculateAndRenderDefensive(typesData) {
    let multipliers = {};
    const allTypes = ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'];
    
    allTypes.forEach(t => multipliers[t] = 1);
    
    typesData.forEach(typeData => {
        typeData.damage_relations.double_damage_from.forEach(t => multipliers[t.name] *= 2);
        typeData.damage_relations.half_damage_from.forEach(t => multipliers[t.name] *= 0.5);
        typeData.damage_relations.no_damage_from.forEach(t => multipliers[t.name] *= 0);
    });
    
    const weak4x = [], weak2x = [], resist05x = [], resist025x = [], immune0x = [];
    Object.entries(multipliers).forEach(([type, mult]) => {
        if (mult === 4) weak4x.push(type);
        else if (mult === 2) weak2x.push(type);
        else if (mult === 0.5) resist05x.push(type);
        else if (mult === 0.25) resist025x.push(type);
        else if (mult === 0) immune0x.push(type);
    });
    
    let html = '';
    
    if (weak4x.length || weak2x.length) {
        html += '<div class="effectiveness-group"><div class="effectiveness-title"><span class="multiplier-badge multiplier-2x">Weak To</span></div><div class="type-list">';
        weak4x.forEach(t => html += `<span class="type-badge type-${t}">${t} (4x)</span>`);
        weak2x.forEach(t => html += `<span class="type-badge type-${t}">${t}</span>`);
        html += '</div></div>';
    }
    
    if (resist05x.length || resist025x.length) {
        html += '<div class="effectiveness-group"><div class="effectiveness-title"><span class="multiplier-badge multiplier-05x">Resistant To</span></div><div class="type-list">';
        resist025x.forEach(t => html += `<span class="type-badge type-${t}">${t} (0.25x)</span>`);
        resist05x.forEach(t => html += `<span class="type-badge type-${t}">${t}</span>`);
        html += '</div></div>';
    }
    
    if (immune0x.length) {
        html += '<div class="effectiveness-group"><div class="effectiveness-title"><span class="multiplier-badge multiplier-0x">Immune To</span></div><div class="type-list">';
        immune0x.forEach(t => html += `<span class="type-badge type-${t}">${t}</span>`);
        html += '</div></div>';
    }
    
    if (!html) html = '<div class="effectiveness-none">No special defensive interactions.</div>';
    
    const container = document.getElementById('defensiveEffectiveness');
    if(container) container.innerHTML = html;
}

function calculateAndRenderOffensive(typesData) {
    let superEffective = new Set();
    let notVeryEffective = new Set();
    let noEffect = new Set();
    
    typesData.forEach(typeData => {
        typeData.damage_relations.double_damage_to.forEach(t => superEffective.add(t.name));
        typeData.damage_relations.half_damage_to.forEach(t => notVeryEffective.add(t.name));
        typeData.damage_relations.no_damage_to.forEach(t => noEffect.add(t.name));
    });
    
    let html = '';
    
    if (superEffective.size > 0) {
        html += '<div class="effectiveness-group"><div class="effectiveness-title"><span class="multiplier-badge multiplier-2x">Super Effective Against</span></div><div class="type-list">';
        Array.from(superEffective).forEach(t => html += `<span class="type-badge type-${t}">${t}</span>`);
        html += '</div></div>';
    }
    
    if (notVeryEffective.size > 0) {
        html += '<div class="effectiveness-group"><div class="effectiveness-title"><span class="multiplier-badge multiplier-05x">Not Very Effective Against</span></div><div class="type-list">';
        Array.from(notVeryEffective).forEach(t => html += `<span class="type-badge type-${t}">${t}</span>`);
        html += '</div></div>';
    }
    
    if (noEffect.size > 0) {
        html += '<div class="effectiveness-group"><div class="effectiveness-title"><span class="multiplier-badge multiplier-0x">No Effect Against</span></div><div class="type-list">';
        Array.from(noEffect).forEach(t => html += `<span class="type-badge type-${t}">${t}</span>`);
        html += '</div></div>';
    }
    
    if (!html) html = '<div class="effectiveness-none">No special offensive interactions.</div>';
    
    const container = document.getElementById('offensiveEffectiveness');
    if(container) container.innerHTML = html;
}

function renderWeatherTerrain(typeNames) {
    const section = document.getElementById('weatherTerrainSection');
    const list = document.getElementById('weatherTerrainList');
    
    if (!section || !list) return;
    
    let matchedEffects = [];
    
    typeNames.forEach(t => {
        if (weatherTerrainMap[t]) {
            matchedEffects = matchedEffects.concat(weatherTerrainMap[t]);
        }
    });
    
    if (matchedEffects.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    let uniqueEffects = [];
    let seenEffects = new Set();
    matchedEffects.forEach(e => {
        if (!seenEffects.has(e.effect)) {
            uniqueEffects.push(e);
            seenEffects.add(e.effect);
        }
    });
    
    section.style.display = 'block';
    
    list.innerHTML = uniqueEffects.map(effect => `
        <div class="weather-card">
            <div class="weather-icon-wrapper">
                ${effect.icon}
            </div>
            <div class="weather-info">
                <h4>${effect.name}</h4>
                <p>${effect.effect}</p>
            </div>
        </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('copyrightModal');
    const closeBtn = document.getElementById('closeCopyrightBtn');
    
    if (modal && closeBtn) {
        window.addEventListener('loaderFinished', () => {
            modal.classList.add('active');
        });
        
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('active');
        });
    }
});
