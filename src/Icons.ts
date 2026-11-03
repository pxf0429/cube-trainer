// One drawing grid and stroke weight for every control. Pink is reserved for
// a small secondary shape, so icons remain readable at button size.
const accent = 'var(--icon-accent, #e7a3bd)';
const drawings: { [key: string]: string } = {
    home: '<path d="m3 10 9-7 9 7M5 9v11h14V9M10 20v-7h4v7"/><path d="m12 3 5 3.9" stroke="' + accent + '" stroke-width="2.2"/>',
    memory: '<path d="M9 4a3 3 0 0 0-5 2.2 3.8 3.8 0 0 0-1 6.4A4.5 4.5 0 0 0 8 20h1V4Zm6 0a3 3 0 0 1 5 2.2 3.8 3.8 0 0 1 1 6.4A4.5 4.5 0 0 1 16 20h-1V4Z"/><path d="M5 9h4m-4 6h4m6-6h4m-4 6h4M9 12h6" stroke="' + accent + '"/>',
    image: '<rect x="3" y="3.5" width="18" height="17" rx="2"/><circle cx="8" cy="8.5" r="2" fill="' + accent + '" stroke="none"/><path d="m3 17 5-5 4 4 3-5 6 6"/>',
    plus: '<path d="M12 4v16M4 12h16"/><circle cx="19" cy="5" r="2" fill="' + accent + '" stroke="none"/>',
    pencil: '<path d="m4 16-1 5 5-1L20 8a2.8 2.8 0 0 0-4-4L4 16Zm9-9 4 4M4 16l4 4"/><path d="m16 4 4 4" stroke="' + accent + '" stroke-width="2.5"/>',
    external: '<path d="M13 4h7v7m0-7L10 14M9 5H4v15h15v-5"/><path d="M13 4h7" stroke="' + accent + '" stroke-width="2.2"/>',
    upload: '<path d="M12 16V3m-4 4 4-4 4 4M4 15v6h16v-6"/><path d="M8 21h8" stroke="' + accent + '" stroke-width="2.4"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18h1.3a2.2 2.2 0 0 0 1.5-3.8 1.5 1.5 0 0 1 1-2.7H18A3 3 0 0 0 21 12a9 9 0 0 0-9-9Z"/><circle cx="7.5" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="11" cy="6.8" r="1.3" fill="' + accent + '" stroke="none"/><circle cx="16" cy="8.3" r="1.3" fill="currentColor" stroke="none"/><circle cx="7.5" cy="15" r="1.3" fill="' + accent + '" stroke="none"/>',
    cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9M8 5.3l8 4.5M8 14.3l8 4.5"/><path d="m12 4 3 1.7-3 1.8L9 5.7Z" fill="' + accent + '" stroke="none"/>',
    practice: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="m10 8 6 4-6 4Z" fill="currentColor" stroke="none"/><path d="M7 3.5h5" stroke="' + accent + '" stroke-width="2.5"/>',
    library: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/><rect x="14" y="14" width="6.5" height="6.5" rx="1" fill="' + accent + '" stroke="none"/>',
    chart: '<path d="M4 4v16h16"/><path d="M8 15v-4M12.5 15V6" stroke-width="2.7"/><path d="M17 15V9" stroke="' + accent + '" stroke-width="2.7"/>',
    arrow: '<path d="M4.5 12H19m-5-5 5 5-5 5"/><circle cx="4.5" cy="12" r="1.8" fill="' + accent + '" stroke="none"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    star: '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" fill="currentColor" fill-opacity=".07"/><path d="m12 3 2.7 5.5" stroke="' + accent + '" stroke-width="2.2"/>',
    eye: '<path d="M2.5 12s3.4-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.4 6.5-9.5 6.5S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3.2" fill="currentColor" fill-opacity=".12"/><circle cx="13" cy="11" r="1.3" fill="' + accent + '" stroke="none"/>',
    reset: '<path d="M5.1 7.8A7.5 7.5 0 1 1 5 16M4.5 3.5v5h5"/><path d="M12 7.5V12l3 1.8" stroke="' + accent + '"/>',
    check: '<rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="currentColor" fill-opacity=".06"/><path d="m7.5 12 3 3 6-6"/><circle cx="18.5" cy="5.5" r="2.3" fill="' + accent + '" stroke="none"/>',
    close: '<path d="m6.5 6.5 11 11m-11 0 11-11"/>',
    copy: '<path d="M8 8V4h8l4 4v8h-4"/><path d="M16 4v4h4"/><rect x="4" y="8" width="12" height="12" rx="1.5" fill="currentColor" fill-opacity=".05"/><path d="M7.5 12h5M7.5 15.5h5" stroke="' + accent + '"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/><path d="M12 3.5a8.5 8.5 0 0 1 7.4 4.3" stroke="' + accent + '" stroke-width="2.2"/>',
    keyboard: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M6 9h1m4 0h1m4 0h1M6 13h1m4 0h1m4 0h1"/><path d="M8.5 16h7" stroke="' + accent + '" stroke-width="2"/>',
    bolt: '<path d="m13 3-8 10h6l-1 8L19 10h-6Z" fill="currentColor" fill-opacity=".08"/><path d="m13 3-2 7" stroke="' + accent + '"/>',
    download: '<path d="M12 3v11m-4-4 4 4 4-4M4 15v5h16v-5"/><path d="M8 20h8" stroke="' + accent + '" stroke-width="2.4"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.3 15.3 5 5" stroke-width="2.4"/><path d="M7.2 8.8a3.7 3.7 0 0 1 2-1.8" stroke="' + accent + '"/>',
    help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2.3-2.5 4"/><circle cx="12" cy="16" r="1" fill="' + accent + '" stroke="none"/>',
};

export function icon(name: string, extra = ""): string {
    return '<svg class="icon ' + extra + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        (drawings[name] || drawings.cube) + '</svg>';
}
