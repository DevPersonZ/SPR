document.getElementById('replaceBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('projectInput');
  if (!fileInput.files.length) return alert('Select a .sb3 file first.');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.url.includes("scratch.mit.edu/projects/")) {
    return alert("Please open a Scratch project page.");
  }

  // Read the .sb3 file as a buffer, then Base64 encode it
  const arrayBuffer = await fileInput.files[0].arrayBuffer();
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  );

  // Execute the replacement function in the webpage's main memory
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN", 
    func: replaceScratchProject,
    args: [base64, fileInput.files[0].name]
  });
});

// --- EVERYTHING BELOW RUNS INSIDE THE SCRATCH WEBPAGE MEMORY ---
function replaceScratchProject(base64Data, filename) {
  console.log(`[Replacer] Halting current game and loading ${filename}...`);

  // 1. Convert Base64 back into raw binary memory
  const binaryStr = atob(base64Data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const projectBuffer = bytes.buffer;

  // 2. Scan the React Fiber tree to find the Scratch VM
  let vm = null;
  const rootElements = document.querySelectorAll('#app, div[class^="stage-wrapper"]');
  
  for (let el of rootElements) {
    const reactKeys = Object.keys(el).filter(k => k.startsWith('__reactInternalInstance$') || k.startsWith('__reactFiber$'));
    for (let key of reactKeys) {
      let node = el[key];
      while (node) {
        if (node.stateNode && node.stateNode.props && node.stateNode.props.vm) {
          vm = node.stateNode.props.vm;
          break;
        }
        if (node.memoizedProps && node.memoizedProps.vm) {
          vm = node.memoizedProps.vm;
          break;
        }
        node = node.return;
      }
    }
    if (vm) break;
  }

  if (!vm) {
    alert("Replacer Error: Could not find the Scratch VM in memory.");
    return;
  }

  // 3. Load the new project into the engine
  try {
    vm.loadProject(projectBuffer).then(() => {
      console.log(`[Replacer] Successfully loaded ${filename}!`);
      // Start the newly loaded game automatically
      vm.greenFlag();
    }).catch(e => {
      console.error("[Replacer] VM rejected the .sb3 file:", e);
      alert("Replacer Error: The game engine crashed trying to load the project.");
    });
  } catch (err) {
    console.error(err);
  }
}