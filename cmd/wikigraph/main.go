package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

// --- Data types matching graph.json ---

type Node struct {
	ID       string `json:"id"`
	NodeType string `json:"node_type"`
	WikiURL  string `json:"wiki_url"`
}

type Edge struct {
	Source string `json:"source"`
	Target string `json:"target"`
}

// PreBakedGraph is what the browser receives — ready to hand to cosmos.gl.
type PreBakedGraph struct {
	Seeds          []string  `json:"seeds"`
	Nodes          []string  `json:"nodes"`          // node titles (display names)
	NodeUrls       []string  `json:"nodeUrls"`       // Wikipedia URLs
	NodeTypes      []string  `json:"nodeTypes"`      // "seed" or "expanded"
	Edges          [][2]int  `json:"edges"`          // [sourceIdx, targetIdx] pairs
	PointPositions []float64 `json:"pointPositions"` // flat [x0,y0,x1,y1,...]
	PointSizes     []float64 `json:"pointSizes"`     // one per node
	PointColors    []float64 `json:"pointColors"`    // flat [r,g,b,a, r,g,b,a, ...]
	LinkIndexes    []float64 `json:"linkIndexes"`    // flat [src,tgt, src,tgt, ...]
	LinkColors     []float64 `json:"linkColors"`     // flat [r,g,b,a, ...]
}

// RawGraphJSON is the intermediate format from fetching (kept for --layout-only compat).
type RawGraphJSON struct {
	Seeds []string `json:"seeds"`
	Nodes []Node   `json:"nodes"`
	Edges []Edge   `json:"edges"`
}

// --- Wikipedia API ---
// Be a good citizen: single-threaded, polite delays, retry on 429 with backoff.
// See https://www.mediawiki.org/wiki/API:Etiquette

const (
	wikiAPI   = "https://en.wikipedia.org/w/api.php"
	userAgent = "wiki-cosmo-graph/1.0 (https://github.com/stephenk; knowledge graph visualizer)"

	// Polite rate limiting: one request at a time, 200ms between requests
	requestGapMS = 200

	// Retry config for 429 responses
	maxRetries       = 5
	initialBackoffMS = 2000 // start at 2s, doubles each retry
)

var client = &http.Client{Timeout: 30 * time.Second}

func titleFromURL(rawURL string) (string, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", fmt.Errorf("invalid URL: %w", err)
	}
	if !strings.Contains(u.Hostname(), "wikipedia.org") {
		return "", fmt.Errorf("not a Wikipedia URL: %s", rawURL)
	}
	path := u.Path
	if !strings.HasPrefix(path, "/wiki/") {
		return "", fmt.Errorf("no /wiki/ path in URL: %s", rawURL)
	}
	encoded := strings.TrimPrefix(path, "/wiki/")
	decoded, err := url.PathUnescape(encoded)
	if err != nil {
		return "", err
	}
	title := strings.ReplaceAll(decoded, "_", " ")
	title = strings.SplitN(title, "#", 2)[0]
	return strings.TrimSpace(title), nil
}

func wikiURL(title string) string {
	return "https://en.wikipedia.org/wiki/" + url.PathEscape(strings.ReplaceAll(title, " ", "_"))
}

// doRequest performs a single HTTP GET with retry+backoff on 429.
func doRequest(reqURL string) ([]byte, error) {
	backoff := time.Duration(initialBackoffMS) * time.Millisecond

	for attempt := 0; attempt <= maxRetries; attempt++ {
		req, _ := http.NewRequest("GET", reqURL, nil)
		req.Header.Set("User-Agent", userAgent)

		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil, err
		}

		if resp.StatusCode == 200 {
			return body, nil
		}

		if resp.StatusCode == 429 {
			// Respect Retry-After header if present
			wait := backoff
			if ra := resp.Header.Get("Retry-After"); ra != "" {
				if secs, err := strconv.Atoi(ra); err == nil {
					wait = time.Duration(secs) * time.Second
				}
			}

			if attempt < maxRetries {
				fmt.Printf("    ⏸ rate limited, waiting %s (attempt %d/%d)\n", wait.Round(time.Millisecond), attempt+1, maxRetries)
				time.Sleep(wait)
				backoff *= 2 // exponential backoff
				continue
			}
			return nil, fmt.Errorf("rate limited after %d retries", maxRetries)
		}

		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	return nil, fmt.Errorf("max retries exceeded")
}

// fetchLinksForTitle fetches all internal links for a Wikipedia article (handles pagination).
func fetchLinksForTitle(title string) ([]string, error) {
	var links []string
	params := url.Values{
		"action":      {"query"},
		"prop":        {"links"},
		"titles":      {title},
		"pllimit":     {"max"},
		"plnamespace": {"0"},
		"format":      {"json"},
		"origin":      {"*"},
	}

	for {
		reqURL := wikiAPI + "?" + params.Encode()

		body, err := doRequest(reqURL)
		if err != nil {
			return nil, fmt.Errorf("%q: %w", title, err)
		}

		var data struct {
			Query struct {
				Pages map[string]struct {
					Links []struct {
						Title string `json:"title"`
					} `json:"links"`
				} `json:"pages"`
			} `json:"query"`
			Continue map[string]string `json:"continue"`
		}
		if err := json.Unmarshal(body, &data); err != nil {
			return nil, err
		}

		for _, page := range data.Query.Pages {
			for _, link := range page.Links {
				links = append(links, link.Title)
			}
		}

		if data.Continue == nil {
			break
		}
		for k, v := range data.Continue {
			params.Set(k, v)
		}
		time.Sleep(requestGapMS * time.Millisecond)
	}

	return links, nil
}

type progressFunc func(done, total int, current string)

// fetchLinksBatch fetches links for many titles sequentially (one at a time, polite).
func fetchLinksBatch(titles []string, onProgress progressFunc) map[string][]string {
	result := make(map[string][]string)

	for i, title := range titles {
		links, err := fetchLinksForTitle(title)
		if err != nil {
			fmt.Fprintf(os.Stderr, "  warning: %v\n", err)
			result[title] = []string{}
		} else {
			result[title] = links
		}

		if onProgress != nil {
			onProgress(i+1, len(titles), title)
		}

		// Polite gap between articles
		if i < len(titles)-1 {
			time.Sleep(requestGapMS * time.Millisecond)
		}
	}

	return result
}

// buildGraph runs the 2-phase fetch and returns a GraphJSON.
func buildGraph(seeds []string) (*PreBakedGraph, error) {
	// Phase 1: fetch links for seeds
	fmt.Printf("\nPhase 1: Fetching links for %d seed articles...\n", len(seeds))
	seedLinks := fetchLinksBatch(seeds, func(done, total int, current string) {
		fmt.Printf("  [%d/%d] %s\n", done, total, current)
	})

	// Collect all linked titles
	allLinked := make(map[string]bool)
	for _, links := range seedLinks {
		for _, link := range links {
			allLinked[link] = true
		}
	}
	for _, s := range seeds {
		delete(allLinked, s)
	}

	expandTitles := make([]string, 0, len(allLinked))
	for t := range allLinked {
		expandTitles = append(expandTitles, t)
	}

	fmt.Printf("\nPhase 2: Fetching links for %d linked articles (this will take a while)...\n", len(expandTitles))
	fmt.Printf("  Rate: ~%.0f articles/min (polite single-threaded)\n\n", 60.0/(float64(requestGapMS)/1000.0))
	start := time.Now()

	expandedLinks := fetchLinksBatch(expandTitles, func(done, total int, current string) {
		if done%25 == 0 || done == total {
			elapsed := time.Since(start)
			rate := float64(done) / elapsed.Seconds()
			remaining := total - done
			eta := time.Duration(0)
			if rate > 0 {
				eta = time.Duration(float64(remaining)/rate) * time.Second
			}
			fmt.Printf("  [%d/%d] %.1f/sec — ETA %s\n", done, total, rate, eta.Round(time.Second))
		}
	})

	// Merge all link maps
	allLinks := make(map[string][]string)
	for k, v := range seedLinks {
		allLinks[k] = v
	}
	for k, v := range expandedLinks {
		allLinks[k] = v
	}

	// Build node set: ONLY seeds + their direct neighbors (Phase 1 results).
	// Phase 2 data is used solely for edges between these nodes.
	seedSet := make(map[string]bool)
	for _, s := range seeds {
		seedSet[s] = true
	}

	nodeSet := make(map[string]bool)
	for _, s := range seeds {
		nodeSet[s] = true
	}
	for _, links := range seedLinks {
		for _, link := range links {
			nodeSet[link] = true
		}
	}

	var nodes []Node
	for id := range nodeSet {
		ntype := "expanded"
		if seedSet[id] {
			ntype = "seed"
		}
		nodes = append(nodes, Node{ID: id, NodeType: ntype, WikiURL: wikiURL(id)})
	}

	// Build edges (deduplicated)
	edgeSet := make(map[string]bool)
	var edges []Edge
	for source, links := range allLinks {
		if !nodeSet[source] {
			continue
		}
		for _, target := range links {
			if !nodeSet[target] {
				continue
			}
			var key string
			if source < target {
				key = source + "|" + target
			} else {
				key = target + "|" + source
			}
			if !edgeSet[key] {
				edgeSet[key] = true
				edges = append(edges, Edge{Source: source, Target: target})
			}
		}
	}

	elapsed := time.Since(start).Round(time.Second)
	fmt.Printf("\nFetch done! %d nodes, %d edges (took %s)\n", len(nodes), len(edges), elapsed)

	raw := &RawGraphJSON{Seeds: seeds, Nodes: nodes, Edges: edges}
	return bakeGraph(raw), nil
}

// --- Colormap (matches graph.ts exactly) ---

var colorStops = [][3]float64{
	{0.45, 0.38, 0.15}, // dark bronze-gold
	{0.65, 0.55, 0.20}, // warm gold
	{0.80, 0.68, 0.28}, // mid gold
	{0.92, 0.80, 0.35}, // bright gold
	{1.00, 0.90, 0.50}, // light gold
}

func lerpColor(t float64) [4]float64 {
	steps := 50
	idx := int(math.Round(math.Max(0, math.Min(1, t)) * float64(steps-1)))
	tt := float64(idx) / float64(steps-1)
	seg := tt * float64(len(colorStops)-1)
	i := int(math.Min(math.Floor(seg), float64(len(colorStops)-2)))
	f := seg - float64(i)
	a := colorStops[i]
	b := colorStops[i+1]
	return [4]float64{
		a[0] + (b[0]-a[0])*f,
		a[1] + (b[1]-a[1])*f,
		a[2] + (b[2]-a[2])*f,
		0.4 + 0.6*tt,
	}
}

var seedColor = [4]float64{0.8, 0.2, 0.4, 1.0}
var linkColor = [4]float64{0.78, 0.78, 0.82, 0.35}

const minSize = 1.0
const maxSize = 8.0
const seedSize = 14.0

// Filtered node names (matching graph.ts)
var filteredExact = map[string]bool{
	"Wayback Machine": true, "Wikisource": true, "Wikiquote": true,
	"Wikibooks": true, "Wikiversity": true, "Wikinews": true,
	"Wiktionary": true, "Wikimedia Commons": true, "Wikidata": true,
}

func isFilteredNode(title string) bool {
	if filteredExact[title] {
		return true
	}
	if strings.HasSuffix(title, "(identifier)") || strings.HasSuffix(title, "(disambiguation)") {
		return true
	}
	return false
}

// bakeGraph takes raw fetched data and produces a fully pre-computed graph
// ready for the browser to pass directly to cosmos.gl.
func bakeGraph(raw *RawGraphJSON) *PreBakedGraph {
	fmt.Println("\nBaking graph for browser...")
	seedSet := make(map[string]bool)
	for _, s := range raw.Seeds {
		seedSet[s] = true
	}

	// Filter nodes
	var nodes []string
	var nodeUrls []string
	var nodeTypes []string
	for _, n := range raw.Nodes {
		if isFilteredNode(n.ID) {
			continue
		}
		nodes = append(nodes, n.ID)
		nodeUrls = append(nodeUrls, n.WikiURL)
		if seedSet[n.ID] {
			nodeTypes = append(nodeTypes, "seed")
		} else {
			nodeTypes = append(nodeTypes, "expanded")
		}
	}

	nodeIndex := make(map[string]int, len(nodes))
	for i, n := range nodes {
		nodeIndex[n] = i
	}

	// Deduplicate edges (index-based)
	type edgePair struct{ a, b int }
	edgeSet := make(map[edgePair]bool)
	var edges [][2]int
	for _, e := range raw.Edges {
		if isFilteredNode(e.Source) || isFilteredNode(e.Target) {
			continue
		}
		si, ok1 := nodeIndex[e.Source]
		ti, ok2 := nodeIndex[e.Target]
		if !ok1 || !ok2 {
			continue
		}
		key := edgePair{si, ti}
		if si > ti {
			key = edgePair{ti, si}
		}
		if !edgeSet[key] {
			edgeSet[key] = true
			edges = append(edges, [2]int{si, ti})
		}
	}

	fmt.Printf("  %d nodes, %d edges (after filtering)\n", len(nodes), len(edges))

	// Compute degree
	degree := make([]int, len(nodes))
	for _, e := range edges {
		degree[e[0]]++
		degree[e[1]]++
	}

	// Rank-based sizing/coloring (same as graph.ts)
	type rankEntry struct {
		idx    int
		degree int
	}
	var nonSeeds []rankEntry
	for i, n := range nodes {
		if !seedSet[n] {
			nonSeeds = append(nonSeeds, rankEntry{i, degree[i]})
		}
	}
	sort.Slice(nonSeeds, func(a, b int) bool { return nonSeeds[a].degree < nonSeeds[b].degree })

	tByNode := make([]float64, len(nodes))
	for r, entry := range nonSeeds {
		if len(nonSeeds) > 1 {
			tByNode[entry.idx] = float64(r) / float64(len(nonSeeds)-1)
		} else {
			tByNode[entry.idx] = 0.5
		}
	}

	pointSizes := make([]float64, len(nodes))
	pointColors := make([]float64, len(nodes)*4)
	for i, n := range nodes {
		if seedSet[n] {
			pointSizes[i] = seedSize
			copy(pointColors[i*4:], seedColor[:])
		} else {
			t := tByNode[i]
			pointSizes[i] = minSize + (maxSize-minSize)*t
			c := lerpColor(t)
			copy(pointColors[i*4:], c[:])
		}
	}

	// Layout
	ticks := 500
	if len(nodes) > 50000 {
		ticks = 300
	}
	if len(nodes) > 200000 {
		ticks = 200
	}
	positions := computeLayout(len(nodes), edges, ticks)

	// Link indexes + colors
	linkIndexes := make([]float64, len(edges)*2)
	linkColors := make([]float64, len(edges)*4)
	for i, e := range edges {
		linkIndexes[i*2] = float64(e[0])
		linkIndexes[i*2+1] = float64(e[1])
		copy(linkColors[i*4:], linkColor[:])
	}

	return &PreBakedGraph{
		Seeds:          raw.Seeds,
		Nodes:          nodes,
		NodeUrls:       nodeUrls,
		NodeTypes:      nodeTypes,
		Edges:          edges,
		PointPositions: positions,
		PointSizes:     pointSizes,
		PointColors:    pointColors,
		LinkIndexes:    linkIndexes,
		LinkColors:     linkColors,
	}
}

func promptURL(reader *bufio.Reader, label string) (string, error) {
	fmt.Printf("%s: ", label)
	line, err := reader.ReadString('\n')
	if err != nil {
		return "", err
	}
	line = strings.TrimSpace(line)
	if line == "" {
		return "", fmt.Errorf("no URL provided")
	}
	title, err := titleFromURL(line)
	if err != nil {
		return "", err
	}
	return title, nil
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	}
	if cmd != nil {
		cmd.Start()
	}
}

func main() {
	// Check for --layout-only flag: recompute layout on existing graph.json without fetching
	layoutOnly := len(os.Args) > 1 && os.Args[1] == "--layout-only"

	projectRoot, _ := os.Getwd()
	if strings.HasSuffix(projectRoot, filepath.Join("cmd", "wikigraph")) {
		projectRoot = filepath.Dir(filepath.Dir(projectRoot))
	}
	outPath := filepath.Join(projectRoot, "public", "graph.json")

	var baked *PreBakedGraph

	if layoutOnly {
		fmt.Println("Re-baking existing graph.json...")
		raw, err := os.ReadFile(outPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error reading %s: %v\n", outPath, err)
			os.Exit(1)
		}
		// Try loading as RawGraphJSON first (has Node objects with id/node_type/wiki_url)
		rawGraph := &RawGraphJSON{}
		if err := json.Unmarshal(raw, rawGraph); err != nil {
			fmt.Fprintf(os.Stderr, "Error parsing JSON: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Loaded %d nodes, %d edges\n", len(rawGraph.Nodes), len(rawGraph.Edges))
		baked = bakeGraph(rawGraph)
	} else {
		fmt.Println("╔══════════════════════════════════════╗")
		fmt.Println("║   Wikipedia Knowledge Graph Builder   ║")
		fmt.Println("╚══════════════════════════════════════╝")
		fmt.Println()
		fmt.Println("Enter two Wikipedia article URLs to build a graph.")
		fmt.Println("Example: https://en.wikipedia.org/wiki/Alan_Turing")
		fmt.Println()

		reader := bufio.NewReader(os.Stdin)

		title1, err := promptURL(reader, "Seed article 1 (Wikipedia URL)")
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("  → %s\n\n", title1)

		title2, err := promptURL(reader, "Seed article 2 (Wikipedia URL)")
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("  → %s\n\n", title2)

		seeds := []string{title1, title2}

		var buildErr error
		baked, buildErr = buildGraph(seeds)
		if buildErr != nil {
			fmt.Fprintf(os.Stderr, "Error building graph: %v\n", buildErr)
			os.Exit(1)
		}
	}
	data, err := json.Marshal(baked) // no indent — save space on large graphs
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error marshaling JSON: %v\n", err)
		os.Exit(1)
	}

	if err := os.MkdirAll(filepath.Dir(outPath), 0755); err != nil {
		fmt.Fprintf(os.Stderr, "Error creating directory: %v\n", err)
		os.Exit(1)
	}

	if err := os.WriteFile(outPath, data, 0644); err != nil {
		fmt.Fprintf(os.Stderr, "Error writing %s: %v\n", outPath, err)
		os.Exit(1)
	}
	fmt.Printf("Wrote %s (%d bytes)\n", outPath, len(data))

	// Launch dev server
	fmt.Println("\nStarting dev server...")
	devCmd := exec.Command("npm", "run", "dev")
	devCmd.Dir = projectRoot
	devCmd.Stdout = os.Stdout
	devCmd.Stderr = os.Stderr

	if err := devCmd.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Error starting dev server: %v\n", err)
		os.Exit(1)
	}

	// Give Vite a moment to start, then open browser
	time.Sleep(2 * time.Second)
	openBrowser("http://localhost:5173")

	fmt.Println("Press Ctrl+C to stop.")
	devCmd.Wait()
}
