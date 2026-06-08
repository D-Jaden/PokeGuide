const API_URL = 'https://pokeapi.co/api/v2';
let allPokemonData = [];
let cachedPokemonDetails = {};
let currentGeneration = 'all';
let isSearching = false;

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
        await loadGeneration('1');
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
    
    grid.innerHTML = '';
    
    if (pokemonList.length === 0) {
        grid.innerHTML = '<div class="loading">No Pokémon found.</div>';
        return;
    }

    for (let i = 0; i < pokemonList.length; i += chunkSize) {
        // If we switched generation or started searching while loading, abort this render loop
        if (isSearching && pokemonList.length > 50) return; 

        const chunk = pokemonList.slice(i, i + chunkSize);
        const toFetch = chunk.filter(p => !cachedPokemonDetails[p.id]);
        
        if (toFetch.length > 0) {
            try {
                const details = await Promise.all(
                    toFetch.map(async (poke) => {
                        const res = await fetch(poke.url);
                        const data = await res.json();
                        
                        try {
                            const speciesRes = await fetch(data.species.url);
                            data.speciesData = await speciesRes.json();
                        } catch (e) {
                            console.error("Failed to fetch species for", data.name);
                        }
                        
                        return data;
                    })
                );
                details.forEach(d => cachedPokemonDetails[d.id] = d);
            } catch (err) {
                console.error("Failed fetching detail chunk", err);
            }
        }
        
        const chunkDetails = chunk.map(p => cachedPokemonDetails[p.id]).filter(d => d);
        
        const html = chunkDetails.map(renderSingleCard).join('');
        grid.innerHTML += html;
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

function getTypeColor(type) {
    const colors = {
        normal: '#A8A878',
        fire: '#F08030',
        water: '#6890F0',
        grass: '#78C850',
        electric: '#F8D030',
        ice: '#98D8D8',
        fighting: '#C03028',
        poison: '#A040A0',
        ground: '#E0C068',
        flying: '#A890F0',
        psychic: '#F85888',
        bug: '#A8B820',
        rock: '#B8A038',
        ghost: '#705898',
        dragon: '#7038F8',
        dark: '#705848',
        steel: '#B8B8D0',
        fairy: '#EE99AC'
    };
    return colors[type] || '#999999';
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
    simulateLoading(fetchPokemonList);
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
                setTimeout(() => globalLoader.style.display = 'none', 500);
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
                if (voices.length > 0) {
                    const preferred = voices.find(v => 
                        v.name.toLowerCase().includes('google us english') || 
                        v.name.toLowerCase().includes('google uk english male') || 
                        v.name.toLowerCase().includes('david') || 
                        v.name.toLowerCase().includes('daniel') || 
                        (v.lang.startsWith('en') && v.name.toLowerCase().includes('male'))
                    );
                    if (preferred) {
                        msg.voice = preferred;
                    }
                }
                
                msg.lang = 'en-US';
                msg.rate = 1.1; 
                msg.pitch = 0.8; 
                
                window.speechSynthesis.speak(msg);
            }, 50);
        } else {
            alert('Text-to-Speech is not supported in your browser.');
        }
    });
}
