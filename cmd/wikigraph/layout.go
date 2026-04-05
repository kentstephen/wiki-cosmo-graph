package main

import (
	"fmt"
	"math"
	"math/rand"
	"time"
)

// Simple force-directed layout matching d3-force behavior:
//   - forceManyBody (Barnes-Hut repulsion)
//   - forceLink (spring attraction)
//   - forceCenter (gravity toward origin)

type vec2 struct{ x, y float64 }

// computeLayout runs a force simulation and returns flat [x,y,x,y,...] positions.
func computeLayout(nodeCount int, edges [][2]int, ticks int) []float64 {
	fmt.Printf("\nComputing layout for %d nodes, %d edges (%d ticks)...\n", nodeCount, len(edges), ticks)
	start := time.Now()

	// Initialize random positions with jitter to avoid coincident points
	pos := make([]vec2, nodeCount)
	vel := make([]vec2, nodeCount)
	for i := range pos {
		pos[i] = vec2{rand.Float64()*1000 - 500, rand.Float64()*1000 - 500}
	}

	// Build adjacency for link force
	type link struct{ source, target int }
	links := make([]link, len(edges))
	for i, e := range edges {
		links[i] = link{e[0], e[1]}
	}

	// Scale parameters for graph size
	chargeStrength := -200.0
	linkStrength := 0.05
	linkDistance := 50.0
	centerStrength := 0.1
	velocityDecay := 0.6

	// For large graphs, weaken repulsion to prevent explosion
	if nodeCount > 10000 {
		chargeStrength = -30.0
		linkStrength = 0.1
		linkDistance = 10.0
		centerStrength = 0.3
		velocityDecay = 0.4
	} else if nodeCount > 1000 {
		chargeStrength = -100.0
		centerStrength = 0.2
		velocityDecay = 0.5
	}

	alpha := 1.0
	alphaDecay := 1.0 - math.Pow(0.001, 1.0/float64(ticks))

	for tick := 0; tick < ticks; tick++ {
		if tick%50 == 0 {
			elapsed := time.Since(start)
			fmt.Printf("  tick %d/%d (%.1fs)\n", tick, ticks, elapsed.Seconds())
		}

		// --- Many-body force (Barnes-Hut) ---
		tree := buildQuadTree(pos)
		for i := range pos {
			fx, fy := treeForce(tree, pos[i], chargeStrength, 0.81)
			vel[i].x += fx * alpha
			vel[i].y += fy * alpha
		}

		// --- Link force ---
		for _, l := range links {
			dx := pos[l.target].x - pos[l.source].x
			dy := pos[l.target].y - pos[l.source].y
			dist := math.Sqrt(dx*dx + dy*dy)
			if dist < 1e-6 {
				dist = 1e-6
			}
			strength := linkStrength * alpha
			disp := (dist - linkDistance) / dist * strength
			fx := dx * disp
			fy := dy * disp
			vel[l.source].x += fx
			vel[l.source].y += fy
			vel[l.target].x -= fx
			vel[l.target].y -= fy
		}

		// --- Center force ---
		var cx, cy float64
		for _, p := range pos {
			cx += p.x
			cy += p.y
		}
		cx /= float64(nodeCount)
		cy /= float64(nodeCount)
		for i := range pos {
			vel[i].x -= cx * centerStrength
			vel[i].y -= cy * centerStrength
		}

		// --- Apply velocities (with clamping to prevent explosion) ---
		maxVel := 50.0
		for i := range pos {
			vel[i].x *= velocityDecay
			vel[i].y *= velocityDecay
			// Clamp velocity
			if vel[i].x > maxVel { vel[i].x = maxVel }
			if vel[i].x < -maxVel { vel[i].x = -maxVel }
			if vel[i].y > maxVel { vel[i].y = maxVel }
			if vel[i].y < -maxVel { vel[i].y = -maxVel }
			pos[i].x += vel[i].x
			pos[i].y += vel[i].y
		}

		alpha *= (1 - alphaDecay)
	}

	elapsed := time.Since(start)
	fmt.Printf("  Layout done in %.1fs\n", elapsed.Seconds())

	result := make([]float64, nodeCount*2)
	for i, p := range pos {
		result[i*2] = p.x
		result[i*2+1] = p.y
	}
	return result
}

// --- Barnes-Hut Quadtree (array-based, no recursion) ---

// Flat quadtree stored in arrays. Each node has 4 child slots.
// Children are stored by index; -1 means no child.
type quadTree struct {
	cx, cy     []float64 // center of mass
	mass       []float64
	minX, minY []float64
	maxX, maxY []float64
	children   [][4]int32 // child indices, -1 = none
	isLeaf     []bool
	pointX     []float64 // point position (only valid if isLeaf)
	pointY     []float64
	count      int
}

func newQuadTree(capacity int) *quadTree {
	return &quadTree{
		cx:       make([]float64, 0, capacity),
		cy:       make([]float64, 0, capacity),
		mass:     make([]float64, 0, capacity),
		minX:     make([]float64, 0, capacity),
		minY:     make([]float64, 0, capacity),
		maxX:     make([]float64, 0, capacity),
		maxY:     make([]float64, 0, capacity),
		children: make([][4]int32, 0, capacity),
		isLeaf:   make([]bool, 0, capacity),
		pointX:   make([]float64, 0, capacity),
		pointY:   make([]float64, 0, capacity),
	}
}

func (t *quadTree) addNode(bminX, bminY, bmaxX, bmaxY float64) int {
	idx := t.count
	t.count++
	t.cx = append(t.cx, 0)
	t.cy = append(t.cy, 0)
	t.mass = append(t.mass, 0)
	t.minX = append(t.minX, bminX)
	t.minY = append(t.minY, bminY)
	t.maxX = append(t.maxX, bmaxX)
	t.maxY = append(t.maxY, bmaxY)
	t.children = append(t.children, [4]int32{-1, -1, -1, -1})
	t.isLeaf = append(t.isLeaf, false)
	t.pointX = append(t.pointX, 0)
	t.pointY = append(t.pointY, 0)
	return idx
}

func (t *quadTree) quadrant(node int, px, py float64) int {
	midX := (t.minX[node] + t.maxX[node]) / 2
	midY := (t.minY[node] + t.maxY[node]) / 2
	if px >= midX {
		if py >= midY {
			return 3
		}
		return 1
	}
	if py >= midY {
		return 2
	}
	return 0
}

func (t *quadTree) childBounds(node, q int) (float64, float64, float64, float64) {
	midX := (t.minX[node] + t.maxX[node]) / 2
	midY := (t.minY[node] + t.maxY[node]) / 2
	switch q {
	case 0:
		return t.minX[node], t.minY[node], midX, midY
	case 1:
		return midX, t.minY[node], t.maxX[node], midY
	case 2:
		return t.minX[node], midY, midX, t.maxY[node]
	case 3:
		return midX, midY, t.maxX[node], t.maxY[node]
	}
	return 0, 0, 0, 0
}

func (t *quadTree) insert(px, py float64) {
	node := 0 // root
	const maxDepth = 50

	for depth := 0; depth < maxDepth; depth++ {
		if t.mass[node] == 0 && !t.isLeaf[node] {
			// Empty node, place point here
			t.pointX[node] = px
			t.pointY[node] = py
			t.cx[node] = px
			t.cy[node] = py
			t.mass[node] = 1
			t.isLeaf[node] = true
			return
		}

		if t.isLeaf[node] {
			// Need to split — push existing point down
			oldPx, oldPy := t.pointX[node], t.pointY[node]
			t.isLeaf[node] = false

			// If points are essentially the same, just add mass
			if math.Abs(oldPx-px) < 1e-10 && math.Abs(oldPy-py) < 1e-10 {
				t.mass[node] += 1
				return
			}

			// Re-insert old point into child
			oq := t.quadrant(node, oldPx, oldPy)
			if t.children[node][oq] == -1 {
				bx0, by0, bx1, by1 := t.childBounds(node, oq)
				t.children[node][oq] = int32(t.addNode(bx0, by0, bx1, by1))
			}
			oldChild := int(t.children[node][oq])
			t.pointX[oldChild] = oldPx
			t.pointY[oldChild] = oldPy
			t.cx[oldChild] = oldPx
			t.cy[oldChild] = oldPy
			t.mass[oldChild] = 1
			t.isLeaf[oldChild] = true
		}

		// Update center of mass
		newMass := t.mass[node] + 1
		t.cx[node] = (t.cx[node]*t.mass[node] + px) / newMass
		t.cy[node] = (t.cy[node]*t.mass[node] + py) / newMass
		t.mass[node] = newMass

		// Descend into appropriate child
		q := t.quadrant(node, px, py)
		if t.children[node][q] == -1 {
			bx0, by0, bx1, by1 := t.childBounds(node, q)
			t.children[node][q] = int32(t.addNode(bx0, by0, bx1, by1))
		}
		node = int(t.children[node][q])
	}

	// Max depth reached — just add mass
	t.mass[node] += 1
}

func buildQuadTree(points []vec2) *quadTree {
	if len(points) == 0 {
		return nil
	}

	minX, minY := math.Inf(1), math.Inf(1)
	maxX, maxY := math.Inf(-1), math.Inf(-1)
	for _, p := range points {
		if p.x < minX {
			minX = p.x
		}
		if p.y < minY {
			minY = p.y
		}
		if p.x > maxX {
			maxX = p.x
		}
		if p.y > maxY {
			maxY = p.y
		}
	}

	// Make square with padding
	dx := maxX - minX
	dy := maxY - minY
	if dx > dy {
		maxY = minY + dx
	} else {
		maxX = minX + dy
	}
	minX -= 1
	minY -= 1
	maxX += 1
	maxY += 1

	// Estimate capacity: ~4x points for internal nodes
	tree := newQuadTree(len(points) * 4)
	tree.addNode(minX, minY, maxX, maxY) // root = index 0

	for _, p := range points {
		tree.insert(p.x, p.y)
	}

	return tree
}

// treeForce computes Barnes-Hut force on point p using an iterative stack.
func treeForce(t *quadTree, p vec2, strength float64, thetaSq float64) (float64, float64) {
	if t == nil || t.count == 0 {
		return 0, 0
	}

	var fx, fy float64
	// Use an explicit stack instead of recursion
	stack := make([]int, 0, 64)
	stack = append(stack, 0) // root

	for len(stack) > 0 {
		node := stack[len(stack)-1]
		stack = stack[:len(stack)-1]

		if t.mass[node] == 0 {
			continue
		}

		dx := t.cx[node] - p.x
		dy := t.cy[node] - p.y
		distSq := dx*dx + dy*dy

		if t.isLeaf[node] {
			if distSq < 1e-6 {
				continue
			}
			dist := math.Sqrt(distSq)
			f := strength / distSq
			fx += dx / dist * f
			fy += dy / dist * f
			continue
		}

		// Barnes-Hut check
		w := t.maxX[node] - t.minX[node]
		if w*w/distSq < thetaSq {
			if distSq < 1e-6 {
				continue
			}
			dist := math.Sqrt(distSq)
			f := strength * t.mass[node] / distSq
			fx += dx / dist * f
			fy += dy / dist * f
			continue
		}

		// Push children onto stack
		for _, c := range t.children[node] {
			if c >= 0 {
				stack = append(stack, int(c))
			}
		}
	}

	return fx, fy
}
