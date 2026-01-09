import json
import hashlib
import math
import os
import random
import sys

def string_to_color(s):
    hash_object = hashlib.md5(s.encode())
    hex_dig = hash_object.hexdigest()
    return "#" + hex_dig[:6]

def string_to_pseudo_random(s):
    hash_object = hashlib.md5(s.encode())
    hex_dig = hash_object.hexdigest()
    nums = [int(hex_dig[i], 16) % 4 for i in range(5)]
    return nums

def load_activity_metrics():
    try:
        # Determine path to activity_log.json (parent directory of this script)
        # script_dir = visualizer/
        # file = ../activity_log.json
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        path = os.path.join(base_dir, "activity_log.json")
        
        if os.path.exists(path):
            with open(path, 'r') as f:
                return json.load(f)
        else:
            print(f"Activity Log not found at {path}, using defaults.")
    except Exception as e:
        print(f"Error loading activity log: {e}")
    return {}

def generate_city_slots(limit):
    slots = []
    facing_dir = []
    
    # 0. Central House for Author
    slots.append((0, 0))
    facing_dir.append("down")
    
    # If limit is 1, we are done
    if limit <= 1:
        return slots, facing_dir, []
        
    # Generate remaining slots
    limit_remaining = limit - 1
    
    # "Grand Cross" Layout
    # Hierarchy of spaces:
    # 1. House-to-House: 2 units (Dense)
    # 2. Block-to-Block: 4 units (Street)
    # 3. Quadrant-to-Quadrant: 12 units (Main Avenue)
    
    HOUSE_GAP = 2
    STREET_GAP = 2 # Reduced from 4 to be closer
    MAIN_AVENUE_WIDTH = 6
    
    CLUSTER_ROWS = 4
    CLUSTER_COLS = 4
    HOUSES_PER_BLOCK = CLUSTER_ROWS * CLUSTER_COLS
    
    # Calculate Block Size
    BLOCK_WIDTH = (CLUSTER_COLS - 1) * HOUSE_GAP
    BLOCK_HEIGHT = (CLUSTER_ROWS - 1) * HOUSE_GAP
    
    # Stride (How much space one block takes including its street)
    BLOCK_STRIDE_X = BLOCK_WIDTH + STREET_GAP
    BLOCK_STRIDE_Y = BLOCK_HEIGHT + STREET_GAP
    
    # Number of houses needed
    total_blocks = math.ceil(limit / HOUSES_PER_BLOCK)
    
    # We distribute blocks into 4 Quadrants symmetrically
    # 0: NE (+x, -y), 1: NW (-x, -y), 2: SW (-x, +y), 3: SE (+x, +y)
    
    # Quadrant Multipliers
    quadrants = [
        (1, -1),  # NE
        (-1, -1), # NW
        (-1, 1),  # SW
        (1, 1)    # SE
    ]
    
    # Generate abstract block positions for ONE quadrant
    abstract_block_positions = []
    layer = 0
    while len(abstract_block_positions) * 4 < total_blocks + 4: # +4 buffer
        for x in range(layer + 1):
            y = layer - x
            abstract_block_positions.append((x, y))
        layer += 1
        
    # Generate Houses
    houses_placed = 0
    road_tiles = set()
    
    # Loop over abstract positions (0,0), (1,0)...
    for bx, by in abstract_block_positions:
        # For this abstract position, place it in all 4 quadrants (subject to limit)
        for q_idx in range(4):
            if houses_placed >= limit_remaining: break
            
            qx, qy = quadrants[q_idx]
            
            # Start position of this block in World Space
            # Fill OUTWARDS from center.
            base_x = (MAIN_AVENUE_WIDTH / 2) * qx
            base_y = (MAIN_AVENUE_WIDTH / 2) * qy
            
            # Add block strides
            block_start_x = base_x + (bx * BLOCK_STRIDE_X * qx)
            block_start_y = base_y + (by * BLOCK_STRIDE_Y * qy)
            
            # Fill the block with houses
            for i in range(HOUSES_PER_BLOCK):
                if houses_placed >= limit_remaining: break
                
                # Inner Grid (0..3, 0..3)
                ix = i % CLUSTER_COLS
                iy = i // CLUSTER_COLS
                
                # World Pos
                house_x = block_start_x + (ix * HOUSE_GAP * qx)
                house_y = block_start_y + (iy * HOUSE_GAP * qy)
                
                slots.append((house_x, house_y))
                
                # Facing Logic: Face the vertical axis (Left/Right)
                if house_x > 0:
                    facing_dir.append("left")
                else:
                    facing_dir.append("right")
                
                houses_placed += 1
            
            # --- Road Generation for this Block ---
            def get_r_coord(idx):
                if idx == 0: return 0
                return 2 + idx * 8
            
            rx_in = get_r_coord(bx) * qx
            rx_out = get_r_coord(bx + 1) * qx
            ry_in = get_r_coord(by) * qy
            ry_out = get_r_coord(by + 1) * qy
            
            sx = int(min(rx_in, rx_out))
            ex = int(max(rx_in, rx_out))
            sy = int(min(ry_in, ry_out))
            ey = int(max(ry_in, ry_out))
            
            # Add Horizontal Segments
            for x in range(sx, ex + 1):
                road_tiles.add((x, int(ry_in)))
                road_tiles.add((x, int(ry_out)))
                
            # Add Vertical Segments
            for y in range(sy, ey + 1):
                road_tiles.add((int(rx_in), y))
                road_tiles.add((int(rx_out), y))
                
    if slots:
        # --- Central House Adjustment (Post-Process) ---
        for i in range(-2, 3):
             if (0, i) in road_tiles: road_tiles.remove((0, i))
             if (i, 0) in road_tiles: road_tiles.remove((i, 0))
             
        # Add Ring Road around Central House
        ring_min = -2
        ring_max = 2
        for x in range(ring_min, ring_max + 1):
            road_tiles.add((x, ring_min))
            road_tiles.add((x, ring_max))
        for y in range(ring_min, ring_max + 1):
            road_tiles.add((ring_min, y))
            road_tiles.add((ring_max, y))
                
    return slots, facing_dir, list(road_tiles)

def generate_city(username="User"):
    # 1. Load Activity Data
    metrics = load_activity_metrics()
    total_keys = metrics.get('total_keys', 0)
    active_sec = metrics.get('total_active_seconds', 0)
    idle_sec = metrics.get('total_idle_seconds', 0)
    
    # Rules:
    # - 300 active seconds = 1 Activity House
    # - 300 idle seconds = 1 Activity Tree
    # - 1000 words (5000 keys) = 1 Upgrade (Terrace)
    
    activity_houses_count = int(active_sec // 300)
    activity_trees_count = int(idle_sec // 300)
    
    # 1 word = 5 keys (Standard)
    words_typed = total_keys / 5
    upgrades_count = int(words_typed // 1000)
    
    print(f"--- Activity Integration ---")
    print(f"Active: {active_sec}s -> {activity_houses_count} Houses")
    print(f"Idle: {idle_sec}s -> {activity_trees_count} Trees")
    print(f"Words: {int(words_typed)} -> {upgrades_count} Upgrades")
    
    # 2. Prepare Entity List
    entities = []
    
    # A. Owner (Always First)
    entities.append({ "type": "owner", "login": username })
    
    # B. Activity Houses
    # B. Activity Houses
    # Cyberpunk / Sci-Fi Name Generator
    sci_fi_formats = [
        "Sector-{code}",
        "Unit {code}",
        "{concept} Outpost",
        "{concept} Station",
        "{concept} Node",
        "Block {num}",
        "Zone {code}"
    ]
    
    concepts = ["Alpha", "Beta", "Gamma", "Delta", "Nexus", "Zero", "Void", "Flux", "Core", "Neon", "Cyber", "Null", "Stack", "Heap", "Root"]
    
    for i in range(activity_houses_count):
        # Pick format
        fmt = sci_fi_formats[i % len(sci_fi_formats)]
        
        # Data
        code = f"{random.choice(['A','B','X','Z','7','9'])}-{random.randint(10,99)}"
        num = random.randint(1, 999)
        concept = concepts[i % len(concepts)]
        
        name = fmt.format(code=code, num=num, concept=concept)
        
        # Add slight variation if duplicate index logic creates collision?
        # The simple modulo above cycles.
        
        entities.append({ "type": "activity_house", "login": name })
        
    # C. Activity Trees
    for _ in range(activity_trees_count):
        entities.append({ "type": "tree" })
        
    # 3. Randomize Placement (Except Owner)
    # We keep owner at index 0. We shuffle the rest to mix trees and houses.
    center_entity = entities[0]
    mixable_entities = entities[1:]
    random.shuffle(mixable_entities)
    final_entities = [center_entity] + mixable_entities
    
    # 4. Generate Slots
    limit = len(final_entities)
    # Ensure a minimum layout if empty
    if limit == 0: limit = 1
    
    slots, facings, roads = generate_city_slots(limit)
    
    processed_houses = []
    houses_eligible_for_upgrade = []
    
    for i, (slot_x, slot_y) in enumerate(slots):
        # Safety if slots < entities
        if i >= len(final_entities): break
        
        ent = final_entities[i]
        
        if ent['type'] == 'tree':
            processed_houses.append({
                "x": slot_x,
                "y": slot_y,
                "obstacle": "tree"
            })
        else:
            # It's a house (Owner or Activity)
            u_name = ent['login']
            attrs = string_to_pseudo_random(u_name)
            color = string_to_color(u_name)
            
            # Facing
            facing = facings[i] if i < len(facings) else "down"
            
            house = {
                "x": slot_x,
                "y": slot_y,
                "color": color,
                "roofStyle": attrs[0],
                "doorStyle": attrs[1],
                "windowStyle": attrs[2],
                "chimneyStyle": attrs[3],
                "wallStyle": attrs[4],
                "username": u_name,
                "facing": facing,
                "has_terrace": False # Default state for base
            }
            
            processed_houses.append(house)
            houses_eligible_for_upgrade.append(house)

    # 5. Apply Upgrades based on Typing Activity
    random.shuffle(houses_eligible_for_upgrade)
    
    upgrades_applied = 0
    for h in houses_eligible_for_upgrade:
        if upgrades_applied >= upgrades_count: break
        
        h['has_terrace'] = True
        upgrades_applied += 1
        
    print(f"Applied {upgrades_applied} Terrace Upgrades from typing activity.")

    # 6. Save Files
    with open("stargazers_houses.json", "w") as f:
        json.dump(processed_houses, f, indent=4)
        
    road_data = [{"x": int(r[0]), "y": int(r[1])} for r in roads]
    with open("roads.json", "w") as f:
        json.dump(road_data, f, indent=4)
        
    print(f"Successfully generated {len(processed_houses)} entities and {len(road_data)} road tiles.")

def main():
    username = "SystemUser"
    if len(sys.argv) > 1:
        username = sys.argv[1]
    
    generate_city(username)

if __name__ == "__main__":
    main()
