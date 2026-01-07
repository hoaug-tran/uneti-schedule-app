import Store from 'electron-store';

const store = new Store({
    defaults: {
        autoUpdate: true,
        language: 'vi'
    }
});

export { store };
