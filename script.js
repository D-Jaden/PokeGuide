// Cache to store Pokémon details
const pokemonListCache = new Map();
const pokemonFullCache = new Map();

// Loading indicator
function showLoadingIndicator(container) {
    const loadingDiv = document.createElement('div');
    loadingDiv.classList.add('loading');
    loadingDiv.innerHTML = '<div class="spinner"></div>';
    container.appendChild(loadingDiv);
}

function removeLoadingIndicator(container) {
    const loadingDiv = container.querySelector('.loading');
    if (loadingDiv) {
        container.removeChild(loadingDiv);
    }
}

// Fetch all Pokémon (up to 1025) with minimal data
async function fetchPokemonList() {
    try {
        const response = await fetch('https://pokeapi.co/api/v2/pokemon?limit=1025');
        const data = await response.json();
        console.log(`Fetched Pokémon list: ${data.results.length} Pokémon`);
        return data.results;
    } catch (error) {
        console.error('Error fetching Pokémon list:', error);
        throw error;
    }
}

// Fetch minimal details for a batch of Pokémon with retry logic
async function fetchPokemonMinimalDetailsBatch(names, retries = 3) {
    const fetchPromises = names.map(async (name) => {
        if (pokemonListCache.has(name)) {
            return pokemonListCache.get(name);
        }
        let attempt = 0;
        while (attempt < retries) {
            try {
                const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${name}`);
                const data = await response.json();
                const minimalData = {
                    name: data.name,
                    sprite: data.sprites.front_default,
                    type: data.types[0].type.name
                };
                pokemonListCache.set(name, minimalData);
                pokemonFullCache.set(name, data);
                return minimalData;
            } catch (error) {
                attempt++;
                console.warn(`Failed to fetch ${name}, attempt ${attempt}/${retries}:`, error);
                if (attempt === retries) {
                    console.error(`Failed to fetch ${name} after ${retries} attempts`);
                    return null;
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
    });
    const results = await Promise.all(fetchPromises);
    return results.filter(result => result !== null);
}

// Fetch full details for a single Pokémon (used in modal)
async function fetchPokemonDetails(name, retries = 3) {
    if (pokemonFullCache.has(name)) {
        return pokemonFullCache.get(name);
    }
    let attempt = 0;
    while (attempt < retries) {
        try {
            const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${name}`);
            const data = await response.json();
            pokemonFullCache.set(name, data);
            pokemonListCache.set(name, {
                name: data.name,
                sprite: data.sprites.front_default,
                type: data.types[0].type.name
            });
            return data;
        } catch (error) {
            attempt++;
            console.warn(`Failed to fetch details for ${name}, attempt ${attempt}/${retries}:`, error);
            if (attempt === retries) {
                console.error(`Failed to fetch details for ${name} after ${retries} attempts`);
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
}

// Fetch Pokémon species data (for evolution chain)
async function fetchPokemonSpecies(name, retries = 3) {
    let attempt = 0;
    while (attempt < retries) {
        try {
            const response = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${name}`);
            const data = await response.json();
            return data;
        } catch (error) {
            attempt++;
            console.warn(`Failed to fetch species for ${name}, attempt ${attempt}/${retries}:`, error);
            if (attempt === retries) {
                console.error(`Failed to fetch species for ${name} after ${retries} attempts`);
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
}

// Fetch evolution chain
async function fetchEvolutionChain(url, retries = 3) {
    let attempt = 0;
    while (attempt < retries) {
        try {
            const response = await fetch(url);
            const data = await response.json();
            return data;
        } catch (error) {
            attempt++;
            console.warn(`Failed to fetch evolution chain, attempt ${attempt}/${retries}:`, error);
            if (attempt === retries) {
                console.error(`Failed to fetch evolution chain after ${retries} attempts`);
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
}

// Load a batch of Pokémon and append to the list
async function loadPokemonBatch(pokemonList, startIndex, batchSize, pokemonListDiv) {
    const batch = pokemonList.slice(startIndex, startIndex + batchSize);
    const names = batch.map(pokemon => pokemon.name);

    console.log(`Loading batch: ${startIndex} to ${startIndex + batch.length - 1}`);

    const pokemonDetailsBatch = await fetchPokemonMinimalDetailsBatch(names);

    pokemonDetailsBatch.forEach((pokemonDetails, index) => {
        const pokemon = batch[index];
        const pokemonCard = document.createElement('div');
        pokemonCard.classList.add('pokemon-card');

        const primaryType = pokemonDetails.type;
        pokemonCard.classList.add(primaryType);

        pokemonCard.innerHTML = `
            <img src="${pokemonDetails.sprite}" alt="${pokemon.name}">
            <h3>${pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1)}</h3>
        `;
        pokemonCard.addEventListener('click', (event) => {
            event.preventDefault();
            displayPokemonDetails(pokemon.name);
        });
        pokemonListDiv.appendChild(pokemonCard);
    });

    return startIndex + batch.length;
}

// Display the Pokémon list with infinite scrolling
async function displayPokemonList() {
    const pokemonListDiv = document.getElementById('pokemonList');
    if (!pokemonListDiv) {
        console.error('Pokemon list container not found');
        return;
    }
    pokemonListDiv.innerHTML = '';

    let pokemonList;
    try {
        pokemonList = await fetchPokemonList();
    } catch (error) {
        console.error('Failed to load Pokémon list. Please refresh the page.');
        pokemonListDiv.innerHTML = '<p>Failed to load Pokémon list. Please try again later.</p>';
        return;
    }

    let loadedCount = 0;
    const batchSize = 20;
    const totalPokemon = pokemonList.length;

    console.log(`Total Pokémon to load: ${totalPokemon}`);

    loadedCount = await loadPokemonBatch(pokemonList, loadedCount, 6, pokemonListDiv);

    const loadMoreContainer = document.createElement('div');
    loadMoreContainer.id = 'loadMoreContainer';
    loadMoreContainer.style.textAlign = 'center';
    loadMoreContainer.style.padding = '20px';

    const sentinel = document.createElement('div');
    sentinel.id = 'sentinel';
    sentinel.style.height = '1px';
    loadMoreContainer.appendChild(sentinel);

    const loadMoreButton = document.createElement('button');
    loadMoreButton.textContent = 'Load More Pokémon';
    loadMoreButton.style.padding = '10px 20px';
    loadMoreButton.style.fontSize = '1rem';
    loadMoreButton.style.cursor = 'pointer';
    loadMoreButton.style.display = 'none';
    loadMoreContainer.appendChild(loadMoreButton);

    pokemonListDiv.appendChild(loadMoreContainer);

    let isLoading = false;
    const observer = new IntersectionObserver(async (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && loadedCount < totalPokemon && !isLoading) {
            isLoading = true;
            observer.unobserve(sentinel);

            console.log(`Sentinel intersected, loading more Pokémon... Loaded: ${loadedCount}/${totalPokemon}`);

            try {
                showLoadingIndicator(loadMoreContainer);
                loadedCount = await loadPokemonBatch(pokemonList, loadedCount, batchSize, pokemonListDiv);
            } catch (error) {
                console.error('Error loading batch:', error);
                loadMoreButton.style.display = 'block';
            } finally {
                removeLoadingIndicator(loadMoreContainer);
            }

            if (loadedCount < totalPokemon) {
                const newSentinel = document.createElement('div');
                newSentinel.id = 'sentinel';
                newSentinel.style.height = '1px';
                loadMoreContainer.insertBefore(newSentinel, loadMoreButton);
                observer.observe(newSentinel);
            } else {
                loadMoreContainer.remove();
                console.log('All Pokémon loaded!');
            }

            console.log(`After loading batch: Loaded ${loadedCount}/${totalPokemon} Pokémon`);
            isLoading = false;
        }
    }, {
        root: null,
        rootMargin: '200px',
        threshold: 0.1
    });

    observer.observe(sentinel);

    loadMoreButton.addEventListener('click', async () => {
        if (loadedCount < totalPokemon && !isLoading) {
            isLoading = true;
            loadMoreButton.disabled = true;

            console.log(`Manual load triggered... Loaded: ${loadedCount}/${totalPokemon}`);

            try {
                showLoadingIndicator(loadMoreContainer);
                loadedCount = await loadPokemonBatch(pokemonList, loadedCount, batchSize, pokemonListDiv);
            } catch (error) {
                console.error('Error loading batch manually:', error);
            } finally {
                removeLoadingIndicator(loadMoreContainer);
            }

            if (loadedCount < totalPokemon) {
                observer.observe(sentinel);
            } else {
                loadMoreContainer.remove();
                console.log('All Pokémon loaded!');
            }

            loadMoreButton.disabled = false;
            console.log(`After manual load: Loaded ${loadedCount}/${totalPokemon} Pokémon`);
            isLoading = false;
        }
    });
}

// Display Pokémon details in a modal
async function displayPokemonDetails(name) {
    let pokemonDetails;
    try {
        pokemonDetails = await fetchPokemonDetails(name);
    } catch (error) {
        console.error(`Failed to load details for ${name}`);
        alert(`Failed to load details for ${name}. Please try again.`);
        return;
    }

    let speciesData, evolutionData;
    try {
        speciesData = await fetchPokemonSpecies(name);
        evolutionData = await fetchEvolutionChain(speciesData.evolution_chain.url);
    } catch (error) {
        console.error(`Failed to load species/evolution data for ${name}`);
    }

    const modal = document.getElementById('pokemonModal');
    const modalContent = document.getElementById('modalContent');
    
    if (!modal || !modalContent) {
        console.error('Modal or modal content not found');
        return;
    }

    const primaryType = pokemonDetails.types[0].type.name;
    modalContent.className = 'modal-content';
    modalContent.classList.add(primaryType);

    const evolutions = [];
    if (evolutionData) {
        let current = evolutionData.chain;
        while (current) {
            evolutions.push(current.species.name);
            current = current.evolves_to[0];
        }
    }

    const evolutionDetails = await Promise.all(
        evolutions.map(async (evoName) => {
            try {
                const details = await fetchPokemonDetails(evoName);
                return { name: evoName, sprite: details.sprites.front_default };
            } catch (error) {
                console.error(`Failed to load evolution details for ${evoName}`);
                return { name: evoName, sprite: null };
            }
        })
    );

    modalContent.innerHTML = `
        <span class="close-btn" id="closeModal">×</span>
        <div class="modal-container">
            <div class="modal-details">
                <h2>${pokemonDetails.name.charAt(0).toUpperCase() + pokemonDetails.name.slice(1)} #${pokemonDetails.id}</h2>
                <img src="${pokemonDetails.sprites.front_default}" alt="${pokemonDetails.name}">
                <p><strong>Type:</strong> ${pokemonDetails.types.map(type => type.type.name).join(', ')}</p>
                <p><strong>Height:</strong> ${pokemonDetails.height / 10} m</p>
                <p><strong>Weight:</strong> ${pokemonDetails.weight / 10} kg</p>
                <div class="modal-tabs">
                    <div class="tab active" data-tab="stats">Stats</div>
                    <div class="tab" data-tab="moves">Moves</div>
                    <div class="tab" data-tab="evolutions">Evolutions</div>
                </div>
            </div>
            <div class="modal-stats active" id="stats">
                <h3>Stats</h3>
                ${pokemonDetails.stats.map(stat => `
                    <div class="stats-item">
                        <p>${stat.stat.name.charAt(0).toUpperCase() + stat.stat.name.slice(1)}: ${stat.base_stat}</p>
                        <div class="stats-bar">
                            <div class="stats-fill ${stat.stat.name}" style="width: ${(stat.base_stat / 255) * 100}%"></div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="modal-stats" id="moves">
                <h3>Moves</h3>
                <div class="move-list">
                    ${pokemonDetails.moves.slice(0, 10).map(move => `
                        <div class="move-item">${move.move.name.charAt(0).toUpperCase() + move.move.name.slice(1).replace('-', ' ')}</div>
                    `).join('')}
                </div>
            </div>
            <div class="modal-stats" id="evolutions">
                <h3>Evolutions</h3>
                <div class="evolution-list">
                    ${evolutionDetails.length > 0 ? evolutionDetails.map(evo => `
                        <div class="evolution-item" data-pokemon="${evo.name}">
                            ${evo.sprite ? `<img src="${evo.sprite}" alt="${evo.name}">` : `<p>Image unavailable</p>`}
                            <p>${evo.name.charAt(0).toUpperCase() + evo.name.slice(1)}</p>
                        </div>
                    `).join('') : '<p>No evolution data available</p>'}
                </div>
            </div>
        </div>
    `;

    modal.style.display = 'flex';

    const closeModal = document.getElementById('closeModal');
    closeModal.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });

    const tabs = modalContent.querySelectorAll('.tab');
    const tabContents = modalContent.querySelectorAll('.modal-stats');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            tab.classList.add('active');
            const tabId = tab.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });

    const evolutionItems = modalContent.querySelectorAll('.evolution-item');
    evolutionItems.forEach(item => {
        item.addEventListener('click', (event) => {
            event.preventDefault();
            const pokemonName = item.getAttribute('data-pokemon');
            displayPokemonDetails(pokemonName);
        });
    });
}

// Search functionality with caching
async function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) {
        console.error('Search input not found');
        return;
    }
    searchInput.addEventListener('input', async () => {
        const searchTerm = searchInput.value.toLowerCase();
        const pokemonList = await fetchPokemonList();
        const filteredPokemon = pokemonList.filter(pokemon => pokemon.name.includes(searchTerm));
        
        const pokemonListDiv = document.getElementById('pokemonList');
        if (!pokemonListDiv) {
            console.error('Pokemon list container not found');
            return;
        }
        pokemonListDiv.innerHTML = '';

        const batchSize = 50;
        for (let i = 0; i < filteredPokemon.length; i += batchSize) {
            const batch = filteredPokemon.slice(i, i + batchSize);
            const names = batch.map(pokemon => pokemon.name);
            const pokemonDetailsBatch = await fetchPokemonMinimalDetailsBatch(names);

            pokemonDetailsBatch.forEach((pokemonDetails, index) => {
                const pokemon = batch[index];
                const pokemonCard = document.createElement('div');
                pokemonCard.classList.add('pokemon-card');

                const primaryType = pokemonDetails.type;
                pokemonCard.classList.add(primaryType);

                pokemonCard.innerHTML = `
                    <img src="${pokemonDetails.sprite}" alt="${pokemon.name}">
                    <h3>${pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1)}</h3>
                `;
                pokemonCard.addEventListener('click', (event) => {
                    event.preventDefault();
                    displayPokemonDetails(pokemon.name);
                });
                pokemonListDiv.appendChild(pokemonCard);
            });

            await new Promise(resolve => setTimeout(resolve, 0));
        }
    });
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    displayPokemonList();
    setupSearch();
});
