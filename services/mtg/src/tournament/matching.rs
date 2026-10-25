//! Maximum-weight matching in a general graph
//!
//! Edmonds' blossom algorithm with Galil's dual updates, O(n³), in integers.
//! The structure follows Joris van Rantwijk's well-known `mwmatching.py`;
//! the brute-force comparison in the tests is what vouches for it.

/// No vertex, edge end or blossom
const NONE: usize = usize::MAX;

/// An edge between two vertices and its weight
pub type Edge = (usize, usize, i64);

/// A maximum-weight matching of the graph given by `edges`
///
/// Vertices are `0..n` for the largest index named in `edges`. With
/// `max_cardinality`, only matchings with the most edges are considered and
/// the heaviest of them is returned. The answer maps every vertex to its
/// mate, `None` if it stays unmatched.
pub fn max_weight_matching(edges: &[Edge], max_cardinality: bool) -> Vec<Option<usize>> {
    if edges.is_empty() {
        return Vec::new();
    }
    let mut matcher = Matcher::new(edges, max_cardinality);
    matcher.solve();
    matcher
        .mate
        .iter()
        .map(|&p| (p != NONE).then(|| matcher.endpoint[p]))
        .collect()
}

/// The state of one run, named as in the description of the algorithm
struct Matcher<'a> {
    edges: &'a [Edge],
    max_cardinality: bool,
    vertices: usize,
    /// `endpoint[p]` is the vertex at end `p` of edge `p / 2`
    endpoint: Vec<usize>,
    /// The edge ends leading away from each vertex
    neighbend: Vec<Vec<usize>>,
    /// The edge end a vertex is matched through, `NONE` if single
    mate: Vec<usize>,
    /// 0 free, 1 S, 2 T, with bit 4 set while scanning, per vertex or top blossom
    label: Vec<u8>,
    labelend: Vec<usize>,
    inblossom: Vec<usize>,
    blossomparent: Vec<usize>,
    blossomchilds: Vec<Vec<usize>>,
    blossombase: Vec<usize>,
    blossomendps: Vec<Vec<usize>>,
    bestedge: Vec<usize>,
    blossombestedges: Vec<Option<Vec<usize>>>,
    unusedblossoms: Vec<usize>,
    dualvar: Vec<i64>,
    allowedge: Vec<bool>,
    queue: Vec<usize>,
}

impl<'a> Matcher<'a> {
    fn new(edges: &'a [Edge], max_cardinality: bool) -> Self {
        let vertices = edges
            .iter()
            .map(|&(i, j, _)| i.max(j) + 1)
            .max()
            .unwrap_or(0);
        let max_weight = edges.iter().map(|&(_, _, w)| w).max().unwrap_or(0).max(0);
        let endpoint = (0..2 * edges.len())
            .map(|p| {
                let (i, j, _) = edges[p / 2];
                if p % 2 == 0 { i } else { j }
            })
            .collect();
        let mut neighbend = vec![Vec::new(); vertices];
        for (k, &(i, j, _)) in edges.iter().enumerate() {
            neighbend[i].push(2 * k + 1);
            neighbend[j].push(2 * k);
        }
        let mut dualvar = vec![max_weight; vertices];
        dualvar.extend(std::iter::repeat_n(0, vertices));
        let mut blossombase: Vec<usize> = (0..vertices).collect();
        blossombase.extend(std::iter::repeat_n(NONE, vertices));
        Self {
            edges,
            max_cardinality,
            vertices,
            endpoint,
            neighbend,
            mate: vec![NONE; vertices],
            label: vec![0; 2 * vertices],
            labelend: vec![NONE; 2 * vertices],
            inblossom: (0..vertices).collect(),
            blossomparent: vec![NONE; 2 * vertices],
            blossomchilds: vec![Vec::new(); 2 * vertices],
            blossombase,
            blossomendps: vec![Vec::new(); 2 * vertices],
            bestedge: vec![NONE; 2 * vertices],
            blossombestedges: vec![None; 2 * vertices],
            unusedblossoms: (vertices..2 * vertices).collect(),
            dualvar,
            allowedge: vec![false; edges.len()],
            queue: Vec::new(),
        }
    }

    fn slack(&self, k: usize) -> i64 {
        let (i, j, w) = self.edges[k];
        self.dualvar[i] + self.dualvar[j] - 2 * w
    }

    fn leaves(&self, b: usize) -> Vec<usize> {
        let mut leaves = Vec::new();
        self.collect_leaves(b, &mut leaves);
        leaves
    }

    fn collect_leaves(&self, b: usize, leaves: &mut Vec<usize>) {
        if b < self.vertices {
            leaves.push(b);
        } else {
            for &child in &self.blossomchilds[b] {
                self.collect_leaves(child, leaves);
            }
        }
    }

    fn assign_label(&mut self, w: usize, t: u8, p: usize) {
        let b = self.inblossom[w];
        self.label[w] = t;
        self.label[b] = t;
        self.labelend[w] = p;
        self.labelend[b] = p;
        self.bestedge[w] = NONE;
        self.bestedge[b] = NONE;
        if t == 1 {
            let leaves = self.leaves(b);
            self.queue.extend(leaves);
        } else if t == 2 {
            let base = self.blossombase[b];
            let mate = self.mate[base];
            self.assign_label(self.endpoint[mate], 1, mate ^ 1);
        }
    }

    fn scan_blossom(&mut self, mut v: usize, mut w: usize) -> usize {
        let mut path = Vec::new();
        let mut base = NONE;
        while v != NONE || w != NONE {
            let mut b = self.inblossom[v];
            if self.label[b] & 4 != 0 {
                base = self.blossombase[b];
                break;
            }
            path.push(b);
            self.label[b] = 5;
            if self.labelend[b] == NONE {
                v = NONE;
            } else {
                v = self.endpoint[self.labelend[b]];
                b = self.inblossom[v];
                v = self.endpoint[self.labelend[b]];
            }
            if w != NONE {
                std::mem::swap(&mut v, &mut w);
            }
        }
        for b in path {
            self.label[b] = 1;
        }
        base
    }

    fn add_blossom(&mut self, base: usize, k: usize) {
        let (mut v, mut w, _) = self.edges[k];
        let bb = self.inblossom[base];
        let mut bv = self.inblossom[v];
        let mut bw = self.inblossom[w];
        let b = self
            .unusedblossoms
            .pop()
            .unwrap_or_else(|| unreachable!("a graph of n vertices has at most n blossoms"));
        self.blossombase[b] = base;
        self.blossomparent[b] = NONE;
        self.blossomparent[bb] = b;
        let mut path = Vec::new();
        let mut endps = Vec::new();
        while bv != bb {
            self.blossomparent[bv] = b;
            path.push(bv);
            endps.push(self.labelend[bv]);
            v = self.endpoint[self.labelend[bv]];
            bv = self.inblossom[v];
        }
        path.push(bb);
        path.reverse();
        endps.reverse();
        endps.push(2 * k);
        while bw != bb {
            self.blossomparent[bw] = b;
            path.push(bw);
            endps.push(self.labelend[bw] ^ 1);
            w = self.endpoint[self.labelend[bw]];
            bw = self.inblossom[w];
        }
        self.label[b] = 1;
        self.labelend[b] = self.labelend[bb];
        self.dualvar[b] = 0;
        self.blossomchilds[b] = path.clone();
        self.blossomendps[b] = endps;
        for leaf in self.leaves(b) {
            if self.label[self.inblossom[leaf]] == 2 {
                self.queue.push(leaf);
            }
            self.inblossom[leaf] = b;
        }

        let mut bestedgeto = vec![NONE; 2 * self.vertices];
        for &child in &path {
            let lists: Vec<Vec<usize>> = match self.blossombestedges[child].take() {
                Some(list) => vec![list],
                None => self
                    .leaves(child)
                    .into_iter()
                    .map(|leaf| self.neighbend[leaf].iter().map(|p| p / 2).collect())
                    .collect(),
            };
            for list in lists {
                for k in list {
                    let (i, j, _) = self.edges[k];
                    let j = if self.inblossom[j] == b { i } else { j };
                    let bj = self.inblossom[j];
                    if bj != b
                        && self.label[bj] == 1
                        && (bestedgeto[bj] == NONE || self.slack(k) < self.slack(bestedgeto[bj]))
                    {
                        bestedgeto[bj] = k;
                    }
                }
            }
            self.bestedge[child] = NONE;
        }
        let best: Vec<usize> = bestedgeto.into_iter().filter(|&k| k != NONE).collect();
        self.bestedge[b] = NONE;
        for &k in &best {
            if self.bestedge[b] == NONE || self.slack(k) < self.slack(self.bestedge[b]) {
                self.bestedge[b] = k;
            }
        }
        self.blossombestedges[b] = Some(best);
    }

    fn expand_blossom(&mut self, b: usize, endstage: bool) {
        for s in self.blossomchilds[b].clone() {
            self.blossomparent[s] = NONE;
            if s < self.vertices {
                self.inblossom[s] = s;
            } else if endstage && self.dualvar[s] == 0 {
                self.expand_blossom(s, endstage);
            } else {
                for leaf in self.leaves(s) {
                    self.inblossom[leaf] = s;
                }
            }
        }
        if !endstage && self.label[b] == 2 {
            let childs = self.blossomchilds[b].clone();
            let endps = self.blossomendps[b].clone();
            let len = signed(childs.len());
            let at = |j: isize| -> usize { usize::try_from(j.rem_euclid(len)).unwrap_or(0) };
            let entrychild = self.inblossom[self.endpoint[self.labelend[b] ^ 1]];
            let mut j = signed(
                childs
                    .iter()
                    .position(|&child| child == entrychild)
                    .unwrap_or(0),
            );
            let (jstep, endptrick): (isize, usize) = if j & 1 == 1 {
                j -= len;
                (1, 0)
            } else {
                (-1, 1)
            };
            let mut p = self.labelend[b];
            while j != 0 {
                self.label[self.endpoint[p ^ 1]] = 0;
                let q = endps[at(j - signed(endptrick))];
                self.label[self.endpoint[q ^ endptrick ^ 1]] = 0;
                self.assign_label(self.endpoint[p ^ 1], 2, p);
                self.allowedge[q / 2] = true;
                j += jstep;
                p = endps[at(j - signed(endptrick))] ^ endptrick;
                self.allowedge[p / 2] = true;
                j += jstep;
            }
            let bv = childs[at(j)];
            self.label[self.endpoint[p ^ 1]] = 2;
            self.label[bv] = 2;
            self.labelend[self.endpoint[p ^ 1]] = p;
            self.labelend[bv] = p;
            self.bestedge[bv] = NONE;
            j += jstep;
            while childs[at(j)] != entrychild {
                let bv = childs[at(j)];
                if self.label[bv] == 1 {
                    j += jstep;
                    continue;
                }
                let labelled = self
                    .leaves(bv)
                    .into_iter()
                    .find(|&leaf| self.label[leaf] != 0);
                if let Some(v) = labelled {
                    self.label[v] = 0;
                    let base_mate = self.mate[self.blossombase[bv]];
                    self.label[self.endpoint[base_mate]] = 0;
                    self.assign_label(v, 2, self.labelend[v]);
                }
                j += jstep;
            }
        }
        self.label[b] = 0;
        self.labelend[b] = NONE;
        self.blossomchilds[b] = Vec::new();
        self.blossomendps[b] = Vec::new();
        self.blossombase[b] = NONE;
        self.blossombestedges[b] = None;
        self.bestedge[b] = NONE;
        self.unusedblossoms.push(b);
    }

    fn augment_blossom(&mut self, b: usize, v: usize) {
        let mut t = v;
        while self.blossomparent[t] != b {
            t = self.blossomparent[t];
        }
        if t >= self.vertices {
            self.augment_blossom(t, v);
        }
        let len = signed(self.blossomchilds[b].len());
        let at = |j: isize| -> usize { usize::try_from(j.rem_euclid(len)).unwrap_or(0) };
        let i = self.blossomchilds[b]
            .iter()
            .position(|&child| child == t)
            .unwrap_or(0);
        let mut j = signed(i);
        let (jstep, endptrick): (isize, usize) = if j & 1 == 1 {
            j -= len;
            (1, 0)
        } else {
            (-1, 1)
        };
        while j != 0 {
            j += jstep;
            let t = self.blossomchilds[b][at(j)];
            let p = self.blossomendps[b][at(j - signed(endptrick))] ^ endptrick;
            if t >= self.vertices {
                self.augment_blossom(t, self.endpoint[p]);
            }
            j += jstep;
            let t = self.blossomchilds[b][at(j)];
            if t >= self.vertices {
                self.augment_blossom(t, self.endpoint[p ^ 1]);
            }
            self.mate[self.endpoint[p]] = p ^ 1;
            self.mate[self.endpoint[p ^ 1]] = p;
        }
        self.blossomchilds[b].rotate_left(i);
        self.blossomendps[b].rotate_left(i);
        self.blossombase[b] = self.blossombase[self.blossomchilds[b][0]];
    }

    fn augment_matching(&mut self, k: usize) {
        let (v, w, _) = self.edges[k];
        for (mut s, mut p) in [(v, 2 * k + 1), (w, 2 * k)] {
            loop {
                let bs = self.inblossom[s];
                if bs >= self.vertices {
                    self.augment_blossom(bs, s);
                }
                self.mate[s] = p;
                if self.labelend[bs] == NONE {
                    break;
                }
                let t = self.endpoint[self.labelend[bs]];
                let bt = self.inblossom[t];
                s = self.endpoint[self.labelend[bt]];
                let j = self.endpoint[self.labelend[bt] ^ 1];
                if bt >= self.vertices {
                    self.augment_blossom(bt, j);
                }
                self.mate[j] = self.labelend[bt];
                p = self.labelend[bt] ^ 1;
            }
        }
    }

    fn solve(&mut self) {
        let n = self.vertices;
        for _ in 0..n {
            self.label.fill(0);
            self.bestedge.fill(NONE);
            for best in &mut self.blossombestedges[n..] {
                *best = None;
            }
            self.allowedge.fill(false);
            self.queue.clear();
            for v in 0..n {
                if self.mate[v] == NONE && self.label[self.inblossom[v]] == 0 {
                    self.assign_label(v, 1, NONE);
                }
            }

            let mut augmented = false;
            loop {
                while !augmented {
                    let Some(v) = self.queue.pop() else {
                        break;
                    };
                    for p in self.neighbend[v].clone() {
                        let k = p / 2;
                        let w = self.endpoint[p];
                        if self.inblossom[v] == self.inblossom[w] {
                            continue;
                        }
                        let mut kslack = 0;
                        if !self.allowedge[k] {
                            kslack = self.slack(k);
                            if kslack <= 0 {
                                self.allowedge[k] = true;
                            }
                        }
                        if self.allowedge[k] {
                            if self.label[self.inblossom[w]] == 0 {
                                self.assign_label(w, 2, p ^ 1);
                            } else if self.label[self.inblossom[w]] == 1 {
                                let base = self.scan_blossom(v, w);
                                if base != NONE {
                                    self.add_blossom(base, k);
                                } else {
                                    self.augment_matching(k);
                                    augmented = true;
                                    break;
                                }
                            } else if self.label[w] == 0 {
                                self.label[w] = 2;
                                self.labelend[w] = p ^ 1;
                            }
                        } else if self.label[self.inblossom[w]] == 1 {
                            let b = self.inblossom[v];
                            if self.bestedge[b] == NONE || kslack < self.slack(self.bestedge[b]) {
                                self.bestedge[b] = k;
                            }
                        } else if self.label[w] == 0
                            && (self.bestedge[w] == NONE || kslack < self.slack(self.bestedge[w]))
                        {
                            self.bestedge[w] = k;
                        }
                    }
                }
                if augmented {
                    break;
                }

                let mut deltatype = 0;
                let mut delta = 0;
                let mut deltaedge = NONE;
                let mut deltablossom = NONE;
                if !self.max_cardinality {
                    deltatype = 1;
                    delta = self.dualvar[..n].iter().copied().min().unwrap_or(0);
                }
                for v in 0..n {
                    if self.label[self.inblossom[v]] == 0 && self.bestedge[v] != NONE {
                        let d = self.slack(self.bestedge[v]);
                        if deltatype == 0 || d < delta {
                            delta = d;
                            deltatype = 2;
                            deltaedge = self.bestedge[v];
                        }
                    }
                }
                for b in 0..2 * n {
                    if self.blossomparent[b] == NONE
                        && self.label[b] == 1
                        && self.bestedge[b] != NONE
                    {
                        let d = self.slack(self.bestedge[b]) / 2;
                        if deltatype == 0 || d < delta {
                            delta = d;
                            deltatype = 3;
                            deltaedge = self.bestedge[b];
                        }
                    }
                }
                for b in n..2 * n {
                    if self.blossombase[b] != NONE
                        && self.blossomparent[b] == NONE
                        && self.label[b] == 2
                        && (deltatype == 0 || self.dualvar[b] < delta)
                    {
                        delta = self.dualvar[b];
                        deltatype = 4;
                        deltablossom = b;
                    }
                }
                if deltatype == 0 {
                    deltatype = 1;
                    delta = self.dualvar[..n].iter().copied().min().unwrap_or(0).max(0);
                }

                for v in 0..n {
                    match self.label[self.inblossom[v]] {
                        1 => self.dualvar[v] -= delta,
                        2 => self.dualvar[v] += delta,
                        _ => {}
                    }
                }
                for b in n..2 * n {
                    if self.blossombase[b] != NONE && self.blossomparent[b] == NONE {
                        match self.label[b] {
                            1 => self.dualvar[b] += delta,
                            2 => self.dualvar[b] -= delta,
                            _ => {}
                        }
                    }
                }

                match deltatype {
                    1 => break,
                    2 => {
                        self.allowedge[deltaedge] = true;
                        let (mut i, j, _) = self.edges[deltaedge];
                        if self.label[self.inblossom[i]] == 0 {
                            i = j;
                        }
                        self.queue.push(i);
                    }
                    3 => {
                        self.allowedge[deltaedge] = true;
                        let (i, _, _) = self.edges[deltaedge];
                        self.queue.push(i);
                    }
                    _ => self.expand_blossom(deltablossom, false),
                }
            }

            if !augmented {
                break;
            }
            for b in n..2 * n {
                if self.blossomparent[b] == NONE
                    && self.blossombase[b] != NONE
                    && self.label[b] == 1
                    && self.dualvar[b] == 0
                {
                    self.expand_blossom(b, true);
                }
            }
        }
    }
}

/// An index as a signed number, to walk a blossom's children both ways
fn signed(index: usize) -> isize {
    isize::try_from(index).unwrap_or(isize::MAX)
}

#[cfg(test)]
mod tests {
    use super::Edge;
    use super::max_weight_matching;
    use crate::tournament::rng::SplitMix64;

    /// The weight and size of the best matching, by trying them all
    fn brute_force(vertices: usize, edges: &[Edge], max_cardinality: bool) -> (usize, i64) {
        fn walk(
            from: usize,
            edges: &[Edge],
            used: &mut Vec<bool>,
            size: usize,
            weight: i64,
            best: &mut (usize, i64),
            max_cardinality: bool,
        ) {
            let better = if max_cardinality {
                (size, weight) > *best
            } else {
                weight > best.1
            };
            if better {
                *best = (size, weight);
            }
            for (index, &(i, j, w)) in edges.iter().enumerate().skip(from) {
                if !used[i] && !used[j] {
                    used[i] = true;
                    used[j] = true;
                    walk(
                        index + 1,
                        edges,
                        used,
                        size + 1,
                        weight + w,
                        best,
                        max_cardinality,
                    );
                    used[i] = false;
                    used[j] = false;
                }
            }
        }
        let mut best = (0, 0);
        walk(
            0,
            edges,
            &mut vec![false; vertices],
            0,
            0,
            &mut best,
            max_cardinality,
        );
        best
    }

    /// The size and weight of `mate`, checking it is a matching of `edges`
    fn measure(edges: &[Edge], mate: &[Option<usize>]) -> (usize, i64) {
        let mut size = 0;
        let mut weight = 0;
        for (v, partner) in mate.iter().enumerate() {
            let Some(w) = *partner else {
                continue;
            };
            assert_eq!(mate[w], Some(v), "matched one way only");
            if v < w {
                let edge = edges
                    .iter()
                    .filter(|&&(i, j, _)| (i, j) == (v, w) || (i, j) == (w, v))
                    .map(|&(_, _, weight)| weight)
                    .max()
                    .expect("matched along an edge of the graph");
                size += 1;
                weight += edge;
            }
        }
        (size, weight)
    }

    #[test]
    fn matches_nothing_in_an_empty_graph() {
        assert!(max_weight_matching(&[], false).is_empty());
    }

    #[test]
    fn takes_the_heavier_of_two_crossing_choices() {
        let edges = [(0, 1, 2), (1, 2, 5), (2, 3, 2)];
        assert_eq!(
            max_weight_matching(&edges, false),
            vec![None, Some(2), Some(1), None]
        );
        assert_eq!(
            max_weight_matching(&edges, true),
            vec![Some(1), Some(0), Some(3), Some(2)],
            "most edges first"
        );
    }

    #[test]
    fn finds_the_best_matching_of_any_small_graph() {
        let mut rng = SplitMix64::seeded(2026);
        for round in 0..3000 {
            let vertices = 2 + rng.below(9);
            let mut edges = Vec::new();
            for i in 0..vertices {
                for j in i + 1..vertices {
                    if rng.below(3) > 0 {
                        let weight = i64::try_from(rng.below(30)).expect("small");
                        edges.push((i, j, weight));
                    }
                }
            }
            if edges.is_empty() {
                continue;
            }
            for max_cardinality in [false, true] {
                let mate = max_weight_matching(&edges, max_cardinality);
                let found = measure(&edges, &mate);
                let best = brute_force(vertices, &edges, max_cardinality);
                if max_cardinality {
                    assert_eq!(found, best, "round {round}: {edges:?}");
                } else {
                    assert_eq!(found.1, best.1, "round {round}: {edges:?}");
                }
            }
        }
    }
}
