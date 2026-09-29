// The loading spinner used while a search, a versus check or a name lookup runs
export function createLoadingSpinner() {
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    spinner.innerHTML = '<div></div>';
    return spinner;
}
