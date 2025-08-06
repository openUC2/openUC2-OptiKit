/* small helper to turn the CSV you exported from the XLSX
   (keep the sheet exactly as in the template) into a usable json structure */

function parseUC2csv(csvText){
  const rows = Papa.parse(csvText,{skipEmptyLines:true}).data;
  if(rows.length<4) return {experiments: [], boxes: [], modules: []};

  // experiment columns start at the column labelled "Experiments"
  const expStart = rows[0].findIndex(h=>h && h.trim().toLowerCase()==="experiments");
  const experiments = [];
  const boxes = [];
  const modules = [];

  // build column → experiment map (row0 = name, row1 = description, row2 = github links)
  for(let c=expStart+1;c<rows[0].length;c++){
    if(rows[0][c] && rows[0][c].trim()){
      experiments.push({
        col:c,
        name: rows[0][c].trim(),
        desc: (rows[1][c]||"").trim(),
        img : (rows[2][c]||"").trim(),
        link: (rows[2][c]||"").trim(), // GitHub.io link
        modules:[],
        boxes:[]
      });
    }
  }

  // Parse boxes and modules with their metadata (starting from row 3)
  for(let r=3;r<rows.length;r++){
    const item = (rows[r][0]||"").trim();
    if(!item) continue;
    
    // Determine if this is a box based on item name pattern
    const isBox = item.toLowerCase().includes('box') || item.toLowerCase().includes('ox');

    const itemData = {
      name: item,
      link: (rows[r][1]||"").trim(), // Odoo store link
      desc: (rows[r][2]||"").trim(),
      price: (rows[r][3]||"").trim(),
      img: "IMAGES/" + (rows[r][4] || "").trim(), // Prepend 'IMAGES/' to image path
      experiments: []
    };

    // Check which experiments this item belongs to
    experiments.forEach(e=>{
      const mark = (rows[r][e.col]||"").toString().trim();
      if(mark){
        if(isBox) {
          e.boxes.push({...itemData, quantity: mark});
          itemData.experiments.push(e.name);
        } else {
          e.modules.push({...itemData, quantity: mark});
          itemData.experiments.push(e.name);
        }
      }
    });

    // Store in global arrays
    if(isBox && !boxes.find(b => b.name === item)) {
      boxes.push(itemData);
    } else if(!isBox && !modules.find(m => m.name === item)) {
      modules.push(itemData);
    }
  }
  
  return {experiments, boxes, modules};
}

/* UI glue */

const listEl   = document.getElementById("expList");
const listTitleEl = document.getElementById("listTitle");
const detailEl = document.getElementById("expDetail");
const boxDetailEl = document.getElementById("boxDetail");
const titleEl  = document.getElementById("expTitle");
const descEl   = document.getElementById("expDesc");
const imgEl    = document.getElementById("expImg");
const modList  = document.getElementById("modulesList");
const boxList  = document.getElementById("boxesList");
const boxTitleEl = document.getElementById("boxTitle");
const boxDescEl = document.getElementById("boxDesc");
const experimentsList = document.getElementById("experimentsList");

let EXP_DATA = [];
let BOX_DATA = [];
let MODULE_DATA = [];
let currentMode = 'experiment'; // 'experiment' or 'box'

function buildBoxData() {
  // BOX_DATA is now populated directly from CSV parsing
  return BOX_DATA.map(box => ({
    ...box,
    experimentCount: box.experiments.length
  }));
}

function renderExpList(){
  listEl.innerHTML="";
  EXP_DATA.forEach((e,i)=>{
    const item = document.createElement("div");
    item.className = "experiment-card mb-2";
    
    // Create image container with hover effect
    const imgContainer = document.createElement("div");
    imgContainer.className = "position-relative experiment-img-container";
    imgContainer.style.cursor = "pointer";
    
    const img = document.createElement("img");
    img.src = e.img || "https://via.placeholder.com/200x150?text=" + encodeURIComponent(e.name);
    img.className = "img-fluid rounded";
    img.style.width = "100%";
    img.style.height = "120px";
    img.style.objectFit = "cover";
    img.alt = e.name;
    
    const overlay = document.createElement("div");
    overlay.className = "experiment-overlay position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center";
    overlay.innerHTML = `<h6 class="text-white text-center m-0">${e.name}</h6>`;
    
    imgContainer.appendChild(img);
    imgContainer.appendChild(overlay);
    
    imgContainer.addEventListener("click", () => showExperiment(i));
    imgContainer.addEventListener("mouseenter", () => overlay.style.opacity = "1");
    imgContainer.addEventListener("mouseleave", () => overlay.style.opacity = "0");
    
    item.appendChild(imgContainer);
    listEl.appendChild(item);
  });
}

function renderBoxList(){
  listEl.innerHTML="";
  BOX_DATA.forEach((b,i)=>{
    const item = document.createElement("div");
    item.className = "box-card mb-2";
    
    const imgContainer = document.createElement("div");
    imgContainer.className = "position-relative box-img-container";
    imgContainer.style.cursor = "pointer";
    
    const img = document.createElement("img");
    img.src = b.img || "https://via.placeholder.com/200x150?text=" + encodeURIComponent(b.name);
    img.className = "img-fluid rounded";
    img.style.width = "100%";
    img.style.height = "120px";
    img.style.objectFit = "cover";
    img.alt = b.name;
    
    const overlay = document.createElement("div");
    overlay.className = "box-overlay position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center";
    overlay.innerHTML = `<h6 class="text-white text-center m-0">${b.name}</h6>`;
    
    imgContainer.appendChild(img);
    imgContainer.appendChild(overlay);
    
    imgContainer.addEventListener("click", () => showBox(i));
    imgContainer.addEventListener("mouseenter", () => overlay.style.opacity = "1");
    imgContainer.addEventListener("mouseleave", () => overlay.style.opacity = "0");
    
    // Make image clickable to Odoo store
    if (b.link) {
      img.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        window.open(b.link, '_blank');
      });
      img.title = "Double-click to visit store";
    }
    
    item.appendChild(imgContainer);
    listEl.appendChild(item);
  });
}

function createTreeItem(item, type) {
  const li = document.createElement("li");
  li.className = "list-group-item d-flex align-items-center";
  
  const img = document.createElement("img");
  img.src = item.img || "https://via.placeholder.com/40x40?text=" + encodeURIComponent(item.name.charAt(0));
  img.className = "me-3 rounded";
  img.style.width = "40px";
  img.style.height = "40px";
  img.style.objectFit = "cover";
  
  const content = document.createElement("div");
  content.className = "flex-grow-1";
  content.innerHTML = `
    <div class="fw-bold">${item.name}</div>
    <div class="text-muted small">${item.desc}</div>
    ${item.quantity ? `<div class="badge bg-secondary">Qty: ${item.quantity}</div>` : ''}
  `;
  
  li.appendChild(img);
  li.appendChild(content);
  
  // Add click handler for boxes to go to store
  if (type === 'box' && item.link) {
    li.style.cursor = "pointer";
    li.addEventListener("click", () => window.open(item.link, '_blank'));
    li.title = "Click to visit store";
  }
  
  return li;
}

function showExperiment(idx){
  const e = EXP_DATA[idx];
  titleEl.textContent = e.name;
  descEl.innerHTML = `
    ${e.desc}
    ${e.link ? `<br><a href="${e.link}" target="_blank" class="btn btn-sm btn-outline-primary mt-2">View Instructions</a>` : ''}
  `;
  
  if(e.img){
    imgEl.src = e.img;
    imgEl.classList.remove("d-none");
  } else {
    imgEl.classList.add("d-none");
  }

  // Create tree structure
  modList.innerHTML = "";
  if (e.modules.length > 0) {
    const treeTitle = document.createElement("li");
    treeTitle.className = "list-group-item bg-light fw-bold";
    treeTitle.textContent = `Required Modules (${e.modules.length})`;
    modList.appendChild(treeTitle);
    
    e.modules.forEach(m => modList.appendChild(createTreeItem(m, 'module')));
  }

  boxList.innerHTML = "";
  if (e.boxes.length > 0) {
    const treeTitle = document.createElement("li");
    treeTitle.className = "list-group-item bg-light fw-bold";
    treeTitle.textContent = `Required Boxes (${e.boxes.length})`;
    boxList.appendChild(treeTitle);
    
    e.boxes.forEach(b => boxList.appendChild(createTreeItem(b, 'box')));
  }

  // Highlight selected experiment
  [...listEl.children].forEach((c,i)=>{
    if (i === idx) {
      c.classList.add("selected");
    } else {
      c.classList.remove("selected");
    }
  });
  
  detailEl.classList.remove("d-none");
  boxDetailEl.classList.add("d-none");
}

function showBox(idx){
  const b = BOX_DATA[idx];
  boxTitleEl.textContent = b.name;
  boxDescEl.innerHTML = `
    ${b.desc}
    <br><strong>Price:</strong> ${b.price}
    <br><strong>Enables ${b.experiments.length} experiment(s)</strong>
    ${b.link ? `<br><a href="${b.link}" target="_blank" class="btn btn-sm btn-outline-success mt-2">Visit Store</a>` : ''}
  `;
  
  experimentsList.innerHTML = "";
  
  // Get full experiment data for this box
  const boxExperiments = EXP_DATA.filter(exp => 
    exp.boxes.some(boxItem => boxItem.name === b.name)
  );
  
  if (boxExperiments.length > 0) {
    const treeTitle = document.createElement("li");
    treeTitle.className = "list-group-item bg-light fw-bold";
    treeTitle.textContent = `Possible Experiments (${boxExperiments.length})`;
    experimentsList.appendChild(treeTitle);
    
    boxExperiments.forEach(exp => {
      const li = document.createElement("li");
      li.className = "list-group-item d-flex align-items-center";
      li.style.cursor = "pointer";
      
      const img = document.createElement("img");
      img.src = exp.img || "https://via.placeholder.com/50x50?text=" + encodeURIComponent(exp.name.charAt(0));
      img.className = "me-3 rounded";
      img.style.width = "50px";
      img.style.height = "50px";
      img.style.objectFit = "cover";
      
      const content = document.createElement("div");
      content.className = "flex-grow-1";
      content.innerHTML = `
        <div class="fw-bold">${exp.name}</div>
        <div class="text-muted small">${exp.desc}</div>
        ${exp.link ? `<a href="${exp.link}" target="_blank" class="text-decoration-none small">View Instructions →</a>` : ''}
      `;
      
      li.appendChild(img);
      li.appendChild(content);
      
      // Click to switch to experiment view
      li.addEventListener("click", () => {
        document.getElementById('experimentMode').checked = true;
        switchMode('experiment');
        setTimeout(() => {
          const expIndex = EXP_DATA.findIndex(e => e.name === exp.name);
          if (expIndex >= 0) showExperiment(expIndex);
        }, 100);
      });
      
      experimentsList.appendChild(li);
    });
  }

  // Highlight selected box
  [...listEl.children].forEach((c,i)=>{
    if (i === idx) {
      c.classList.add("selected");
    } else {
      c.classList.remove("selected");
    }
  });
  
  boxDetailEl.classList.remove("d-none");
  detailEl.classList.add("d-none");
}

function switchMode(mode) {
  currentMode = mode;
  
  if (mode === 'experiment') {
    listTitleEl.textContent = 'Experiments';
    renderExpList();
  } else {
    listTitleEl.textContent = 'Boxes';
    renderBoxList();
  }
  
  // Hide both detail sections
  detailEl.classList.add("d-none");
  boxDetailEl.classList.add("d-none");
}

/* file loader */

// Auto-load the default CSV after Papa loads
document.addEventListener('DOMContentLoaded', () => {
  // Wait a bit for Papa to load
  setTimeout(() => {
    fetch('openUC2_Maps_vs_Experiments.csv')
      .then(response => response.text())
      .then(txt => {
        const parsed = parseUC2csv(txt);
        EXP_DATA = parsed.experiments;
        BOX_DATA = parsed.boxes;
        MODULE_DATA = parsed.modules;
        renderExpList();
        detailEl.classList.add("d-none");
        boxDetailEl.classList.add("d-none");
      })
      .catch(err => console.log('Could not auto-load CSV:', err));
  }, 100);
  
  // Mode switcher event listeners
  document.getElementById('experimentMode').addEventListener('change', () => {
    if (document.getElementById('experimentMode').checked) {
      switchMode('experiment');
    }
  });
  
  document.getElementById('boxMode').addEventListener('change', () => {
    if (document.getElementById('boxMode').checked) {
      switchMode('box');
    }
  });
});

document.getElementById("csvFileInput").addEventListener("change",ev=>{
  const file=ev.target.files[0];
  if(!file) return;
  file.text().then(txt=>{
    const parsed = parseUC2csv(txt);
    EXP_DATA = parsed.experiments;
    BOX_DATA = parsed.boxes;
    MODULE_DATA = parsed.modules;
    if (currentMode === 'experiment') {
      renderExpList();
    } else {
      switchMode('box');
    }
    detailEl.classList.add("d-none");
    boxDetailEl.classList.add("d-none");
  });
});