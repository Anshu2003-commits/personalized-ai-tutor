import type { GuideDoc } from "@/lib/guide-types";

/**
 * Companion guide for the autograd-engine project.
 */
export const buildAnAutogradEngine: GuideDoc = {
  meta: {
    slug: "build-an-autograd-engine",
    title: "Build an autograd engine from scratch",
    description:
      "Build a tiny automatic-differentiation engine in Python, one scalar at a time, and use it to see how backpropagation works.",
    keywords: [
      "autograd from scratch",
      "backpropagation explained",
      "micrograd",
      "automatic differentiation",
      "how PyTorch works",
      "chain rule neural network",
      "build neural network from scratch python",
    ],
    readingMinutes: 9,
    datePublished: "2026-06-28",
    dateModified: "2026-06-28",
    relatedCourseSlug: "nn-zero-to-hero",
    relatedProjectSlug: "autograd-engine",
    videoId: "VMj-3S1tku0",
    videoUrl: "https://youtu.be/VMj-3S1tku0",
    level: "Beginner-friendly · Python",
  },
  body: [
    {
      kind: "lede",
      text: "Backpropagation sounds like a wall of calculus. The useful version is smaller: each operation knows how to pass a gradient to its inputs, then the graph is walked backward. By the end of this guide you will have the whole engine working in about 100 lines of Python.",
    },
    {
      kind: "callout",
      tone: "tip",
      title: "Use this with the lecture",
      text: "This guide follows Andrej Karpathy's lecture [“The spelled-out intro to neural networks and backpropagation”](https://youtu.be/VMj-3S1tku0). Watch the video if you want to see the engine built live; use this page for the checkpoints, local rules, and mistakes worth watching for.",
    },
    {
      kind: "quiz",
      prompt:
        "Warm-up, before any code. A neural network is, mathematically, just a big expression that turns inputs and weights into a single number (the loss). Backpropagation computes one thing about that number. What?",
      hint: "It is the value that tells you which direction to nudge each weight.",
      answer:
        "The **gradient of the loss with respect to every weight**: how much the loss would change if you nudged each weight a tiny bit. Backprop computes those gradients; gradient descent then uses them to lower the loss.",
    },

    { kind: "heading", id: "what-youre-building", text: "What you're building" },
    {
      kind: "paragraph",
      text: "“Autograd” is short for *automatic gradient*. An autograd engine implements backpropagation: it computes the gradient of some output (a loss) with respect to all the inputs that produced it (the weights). That single capability is the mathematical core of libraries like PyTorch and JAX. The production versions add tensors, GPU kernels, and a lot of engineering.",
    },
    {
      kind: "paragraph",
      text: "We build it *scalar-valued*, working on individual numbers like `-4.0` and `2.0`, not tensors. That is deliberate. Real libraries pack thousands of scalars into n-dimensional arrays so the hardware can crunch them in parallel, but the math is the same. Stripping tensors away lets you see the mechanism without much machinery around it.",
    },
    {
      kind: "video",
      label: "Why micrograd is only ~100 lines",
      timestamp: "6:54",
      seconds: 414,
    },

    {
      kind: "heading",
      id: "what-a-derivative-means",
      text: "What a derivative means here",
    },
    {
      kind: "paragraph",
      text: "Forget the symbolic rules you memorized in school for a minute. Nobody writing neural nets derives the derivative of the whole network on paper; it would be tens of thousands of terms. What you need here is the *definition*: a derivative measures how sensitively the output responds when you nudge an input by a tiny amount.",
    },
    {
      kind: "paragraph",
      text: "Take any function, bump the input by a tiny `h`, and measure how much the output moved, divided by `h`. That ratio is the slope at that point:",
    },
    {
      kind: "code",
      language: "python",
      caption: "The numerical derivative in four lines.",
      code: `def f(x):
    return 3*x**2 - 4*x + 5

h = 0.0001
x = 3.0
slope = (f(x + h) - f(x)) / h
print(slope)   # ~14.0, how fast f is rising at x = 3`,
    },
    {
      kind: "paragraph",
      text: "We do not use this numerical trick for training, because it is too slow and imprecise. But it is the mental model for everything that follows, and later it is how you will *check* that your real gradients are correct.",
    },
    {
      kind: "quiz",
      prompt:
        "This `f` is an upward parabola. At `x = -3`, the curve is sloping downward. Without computing it: what's the **sign** of the derivative there?",
      hint: "Nudge x slightly more positive. Does f go up or down?",
      answer:
        "**Negative.** Bumping `x` up at `x = -3` makes `f` go *down*, so rise/run is negative. You don't need the exact number to know the sign. That sign is what tells gradient descent which way to step.",
    },

    {
      kind: "heading",
      id: "the-value-object",
      text: "The Value object: numbers that remember",
    },
    {
      kind: "paragraph",
      text: "A network is a huge expression, so we need a data structure that records *how* each number was produced. That's the `Value` object. It wraps a single scalar in `.data`, and this is the key part: when you add or multiply two Values, the result remembers its **children** (the inputs) and the **operation** that made it.",
    },
    {
      kind: "code",
      language: "python",
      caption: "A Value wraps a number and tracks where it came from.",
      code: `class Value:
    def __init__(self, data, _children=(), _op=''):
        self.data = data
        self.grad = 0.0            # gradient, filled in by backprop
        self._prev = set(_children)
        self._op = _op            # the op that produced this node, e.g. '+'

    def __add__(self, other):
        return Value(self.data + other.data, (self, other), '+')

    def __mul__(self, other):
        return Value(self.data * other.data, (self, other), '*')`,
    },
    {
      kind: "paragraph",
      text: "Now `a + b` doesn't just return a number. It returns a new Value that knows its parents were `a` and `b`, joined by a `+`. Build up an expression and you've quietly built a graph: every node points back at the nodes that made it. That graph is what we'll walk backwards.",
    },
    {
      kind: "video",
      label: "Building the Value object and its children",
      timestamp: "19:13",
      seconds: 1153,
    },

    {
      kind: "heading",
      id: "backprop-is-the-chain-rule",
      text: "Backprop is the chain rule, one node at a time",
    },
    {
      kind: "paragraph",
      text: "Give every Value a `.grad` field: the derivative of the final output `L` with respect to *that* node. Backprop fills these in, starting at the end. The base case is trivial: the derivative of `L` with respect to itself is `1`. Then you walk backwards, and at every node you do one tiny, local step.",
    },
    {
      kind: "paragraph",
      text: "Here is the detail that makes it work. Each operation only knows its own *local* derivative: how its output moves when its inputs move. A `+` node has a local derivative of `1` for each input. A `*` node's local derivative for one input is just the *other* input's value. The [chain rule](https://en.wikipedia.org/wiki/Chain_rule) says: to get how a node affects `L`, multiply its local derivative by the gradient flowing into it from above. Do that at every node, accumulating backwards, and you have computed every gradient in the graph.",
    },
    {
      kind: "callout",
      tone: "note",
      title: "Why you multiply (the chain-rule intuition)",
      text: "If a car goes twice as fast as a bike, and the bike goes four times as fast as a walker, the car goes 2 × 4 = 8 times as fast as the walker. Rates of change *multiply* along a chain. Backprop is exactly that, applied to every link in your expression graph.",
    },
    {
      kind: "paragraph",
      text: "Two patterns fall out and they are worth memorizing. A `+` node is a pure **router**: because its local derivative is `1`, it copies the incoming gradient to each input unchanged. A `*` node is a **swapper**: it sends each input the incoming gradient times the *other* input's value.",
    },
    {
      kind: "quiz",
      prompt:
        "A `+` node deep inside the graph receives an incoming gradient of `-2` from above. What gradient does it pass to **each** of its two inputs?",
      hint: "Plus is a router. What's its local derivative?",
      answer:
        "**`-2` to each.** A plus node's local derivative is `1`, so `1 × -2 = -2` flows to both inputs unchanged. Addition just distributes the gradient.",
    },

    {
      kind: "heading",
      id: "automatic-backward",
      text: "From one neuron to an automatic backward()",
    },
    {
      kind: "paragraph",
      text: "Doing this by hand is fine for four nodes and painful for forty. So we automate it. Each operation stores a little closure, `_backward`, that knows how to push its output's gradient into its inputs, exactly the local rules above. Then `backward()` calls them in the right order: a node can only run after everything that depends on it has run. That ordering is a **topological sort**, walked in reverse.",
    },
    {
      kind: "code",
      language: "python",
      caption:
        "Each op defines its local backward; backward() runs them in reverse topological order.",
      code: `def __add__(self, other):
    out = Value(self.data + other.data, (self, other), '+')
    def _backward():
        self.grad  += 1.0 * out.grad      # plus routes the gradient
        other.grad += 1.0 * out.grad
    out._backward = _backward
    return out

def __mul__(self, other):
    out = Value(self.data * other.data, (self, other), '*')
    def _backward():
        self.grad  += other.data * out.grad   # times swaps the inputs
        other.grad += self.data  * out.grad
    out._backward = _backward
    return out

def backward(self):
    topo, visited = [], set()
    def build(v):
        if v not in visited:
            visited.add(v)
            for child in v._prev:
                build(child)
            topo.append(v)
    build(self)

    self.grad = 1.0                 # base case: dL/dL = 1
    for v in reversed(topo):        # walk the graph backwards
        v._backward()`,
    },
    {
      kind: "paragraph",
      text: "With that in place, `loss.backward()` gives every weight in the graph a gradient, no matter how deep the graph is. The same local rules that work for one neuron still work when the graph gets much larger.",
    },
    {
      kind: "callout",
      tone: "warn",
      title: "The bug that catches everyone: accumulate, don't assign",
      text: "Notice the `+=`, not `=`. When a value feeds into more than one place (even something as simple as `a + a`), gradient arrives along *each* path and the contributions must **add**. Assign instead of accumulate and the second path silently overwrites the first. Gradients start at `0.0`, so `+=` is always correct. This is the same class of mistake as forgetting `zero_grad` once you start training, so keep it in mind.",
    },
    {
      kind: "video",
      label: "The accumulate-gradient bug, shown live",
      timestamp: "82:26",
      seconds: 4946,
    },

    {
      kind: "heading",
      id: "size-of-your-lego-bricks",
      text: "You choose the size of your Lego bricks",
    },
    {
      kind: "paragraph",
      text: "A neuron squashes its output through `tanh`, which needs exponentiation, something `+` and `*` alone can't express. You have a choice: break `tanh` down into `exp`, divide, and add (more atomic ops to write backward passes for), or implement `tanh` as a *single* node with its own local derivative `1 - tanh(x)²`. Both give identical gradients. The only rule is: you can build an operation at **any** level of abstraction, as long as you know its local derivative. Atoms or composites; the engine doesn't care.",
    },

    {
      kind: "heading",
      id: "this-is-pytorch",
      text: "This is PyTorch, minus the speed",
    },
    {
      kind: "paragraph",
      text: "Everything you built has a direct twin in PyTorch. Your `Value` is its `tensor`; `.data`, `.grad`, and `.backward()` all exist there and do the same job. The difference is that PyTorch runs the same math over n-dimensional tensors so thousands of these operations happen in parallel on a GPU. When you register a custom op in PyTorch, you give it a forward pass and a local backward pass, the same pattern used here.",
    },
    {
      kind: "video",
      label: "Verifying our gradients against PyTorch",
      timestamp: "99:19",
      seconds: 5959,
    },

    { kind: "heading", id: "build-it", text: "Now build it" },
    {
      kind: "paragraph",
      text: "Reading it helps, but the details settle when you type the code. Open [the autograd-engine project](/projects/nn-zero-to-hero/autograd-engine) and implement `Value` step by step: `__add__`, `__mul__`, `tanh`, then the automatic `backward()`. The tests compare your gradients with the numerical estimate from the first section, so you can tell when the engine is right.",
    },
    {
      kind: "paragraph",
      text: "Once your gradients flow end to end, the next move is to put them to work: [train a neural net on top of your engine](/guides/train-a-neural-net). Build Neuron, Layer, and MLP, then write the gradient-descent loop that makes the loss fall.",
    },
  ],
};
