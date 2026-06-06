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
    8: { start: 810, end: 905 }
};

async function fetchPokemonList() {
    try {
        const response = await fetch(`${API_URL}/pokemon?limit=905&offset=0`);
        const data = await response.json();
        
        allPokemonData = data.results.map((poke, index) => {
            return {
                ...poke,
                id: index + 1
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
    
    const chunkSize = 50;
    
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
                        return res.json();
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
    const description = getRandomDescription(pokemon.name);
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
                <div class="custom-pill name-pill">${pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1)}</div>
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

function performSearch() {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput.value.toLowerCase().trim();
    
    if (!query) {
        loadGeneration(currentGeneration);
        return;
    }
    
    isSearching = true;
    const grid = document.getElementById('pokemonGrid');
    if (grid) grid.innerHTML = '<div class="loading">Searching...</div>';
    
    const matching = allPokemonData.filter(p => 
        p.name.toLowerCase().includes(query) || 
        p.id.toString().includes(query)
    );
    
    // Only render top 50 matches to avoid lag
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
    document.getElementById('pokemonName').textContent = 
        pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1);
    
    document.getElementById('pokemonImage').src = 
        pokemon.sprites.other['official-artwork'].front_default || 
        pokemon.sprites.front_default;
    
    const types = pokemon.types.map(t => t.type.name);
    document.getElementById('typeBadges').innerHTML = 
        types.map(type => `<span class="type-badge type-${type}">${type}</span>`).join('');
    
    const description = speciesData.flavor_text_entries
        .find(e => e.language.name === 'en')?.flavor_text?.replace(/\n/g, ' ') || 
        'A mysterious Pokémon.';
    document.getElementById('pokemonDescription').textContent = description;
    
    document.getElementById('pokemonHeight').textContent = 
        (pokemon.height / 10).toFixed(1) + ' m';
    document.getElementById('pokemonWeight').textContent = 
        (pokemon.weight / 10).toFixed(1) + ' kg';
    document.getElementById('pokemonHp').textContent = 
        pokemon.stats[0].base_stat;
    
    displayEvolution(evolutionData.chain);
    displayStats(pokemon.stats);
    displayAbilities(pokemon.abilities);
    displayMoves(pokemon.moves);
}

function displayEvolution(chain) {
    const evolutionChain = document.getElementById('evolutionChain');
    let html = '';
    let current = chain;
    
    while (current) {
        const pokeName = current.species.name;
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

function displayStats(stats) {
    const statNames = ['HP', 'ATK', 'DEF', 'SPA', 'SPD', 'SPE'];
    const statsBars = document.getElementById('statsBars');
    
    statsBars.innerHTML = stats.map((stat, index) => {
        const percentage = (stat.base_stat / 150) * 100;
        return `
            <div class="stat-bar">
                <div class="stat-bar-name">${statNames[index]}</div>
                <div class="stat-bar-fill">
                    <div class="stat-bar-progress" style="width: ${percentage}%"></div>
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
                <div class="move-description">A powerful move learned by this Pokémon</div>
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
