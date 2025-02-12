const originRegex = /"origin"\s*"(-?\d+)\s+(-?\d+)\s+(-?\d+)"/;

function parseMap(isValveFormat, mapData, wad) {
  const mapGroup = new THREE.Group();
  // Cache textures by name
  const textureCache = new Map();

  // Split the input data into blocks by removing curly braces and trimming
  const blocks = mapData
    .split("}")
    .join("")
    .split("{")
    .map(block => block.trim())
    .filter(block => block);

  let spawnFound = false;

  blocks.forEach(block => {
    const faceData = [];
    const lines = block.split("\n").map(line => line.trim()).filter(Boolean);

    lines.forEach(line => {
      // Look for a spawn origin only once
      if (!spawnFound && line.startsWith('"origin"')) {
        const isSpawn = block.includes("info_player_deathmatch") ||
                        block.includes("info_player_start");
        const match = originRegex.exec(line);
        if (match && isSpawn) {
          setCamPos(
            parseFloat(match[1]),
            parseFloat(match[2]),
            parseFloat(match[3])
          );
          spawnFound = true;
        }
      }
      // Only process lines that start with '(' (face definitions)
      if (!line.startsWith("(")) return;

      const parsedLine = isValveFormat
        ? parseValveMapLine(line)
        : parseQuakeMapLine(line);
      if (!parsedLine) return;

      // Compute the plane from three coplanar points
      parsedLine.plane = new THREE.Plane().setFromCoplanarPoints(
        parsedLine.v0, parsedLine.v1, parsedLine.v2
      );
      faceData.push(parsedLine);
    });

    // Skip blocks that do not start with '(' (i.e. not brush definitions)
    if (!block.startsWith("(")) return;

    if (faceData.length < 4) {
      console.error(`Too few planes (${faceData.length}) for brush:`, block);
      return;
    }

    // Compute brush vertices by intersecting plane triplets
    const vertices = computeBrushVertices(faceData.map(fd => fd.plane));
    if (!vertices.length) {
      console.error("No vertices computed for brush");
      return;
    }

    // Create a group for all the faces (brushes)
    const brushes = new THREE.Group();

    faceData.forEach(fd => {
      const faceVerts = getFacePolygon(fd.plane, vertices);
      if (!faceVerts || faceVerts.length < 3) {
        console.error("Failed to compute face polygon for face:", fd);
        return;
      }

      // If this texture isn’t cached yet, try to extract and create it
      if (!textureCache.has(fd.texture)) {
        const matchingTexture = wad.extractTextureFromName(fd.texture, isValveFormat);
        if (!matchingTexture) {
          console.error(`Failed to find texture '${fd.texture}' in WAD dir`);
          return;
        }
        const texture = createTextureFromMip(matchingTexture, isValveFormat);
        textureCache.set(fd.texture, texture);
      }

      const texture = textureCache.get(fd.texture);
      const faceGeometry = createFaceGeometry(faceVerts, fd, texture);
      const faceMaterial = new THREE.MeshBasicMaterial({
        side: THREE.BackSide,
        map: texture
      });
      const faceMesh = new THREE.Mesh(faceGeometry, faceMaterial);
      brushes.add(faceMesh);
    });

    mapGroup.add(brushes);
  });

  sortTexturesById();
  scene.add(mapGroup);
  return true;
}

function computeBrushVertices(planes) {
  const vertices = [];
  const len = planes.length;
  for (let i = 0; i < len; i++) {
    for (let j = i + 1; j < len; j++) {
      for (let k = j + 1; k < len; k++) {
        const pt = computeIntersection(planes[i], planes[j], planes[k]);
        if (!pt) continue;
        if (!isPointInsideBrush(pt, planes)) continue;
        // Avoid adding duplicate vertices (within a small epsilon)
        if (vertices.some(v => v.distanceToSquared(pt) < FLT_EPSILON)) continue;
        vertices.push(pt);
      }
    }
  }
  return vertices;
}
