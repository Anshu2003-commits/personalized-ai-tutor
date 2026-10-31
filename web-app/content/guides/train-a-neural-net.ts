import type { GuideDoc } from "@/lib/guide-types";

/**
 * Companion guide for the neural-net-training project. Picks up where the
 * autograd guide ends.
 */
export const trainANeuralNet: GuideDoc = {
  meta: {
    slug: "train-a-neural-net",
    title: "Train a neural net from scratch",
    description:
      "Add Neuron, Layer, and MLP classes on top of your autograd engine, then train them with a small gradient-descent loop.",
    keywords: [
      "neural network from scratch python",
      "train neural network from scratch",
      "gradient descent from scratch",
      "multilayer perceptron python",
      "backpropagation training loop",
      "what is a neural network",
    ],
    readingMinutes: 8,
    datePublished: "2026-06-28",
    dateModified: "2026-06-28",
    relatedCourseSlug: "nn-zero-to-hero",
    relatedProjectSlug: "neural-net-training",
    videoId: "VMj-3S1tku0",
    videoUrl: "https://youtu.be/VMj-3S1tku0",
    level: "Beginner-friendly · Python",
  },
  body: [
    {
      kind: "lede",
      text: "You have an engine that computes gradients. Now put it to work. A small neural net is only a few classes on top of autograd: a neuron, a layer, a loss, and a loop that nudges every weight downhill.",
    },
    {
      kind: "callout",
      tone: "tip",
      title: "Do the autograd engine first",
      text: "This builds directly on the `Value` class and the automatic `backward()` from [Build an autograd engine](/guides/build-an-autograd-engine). If `.backward()` and the `+=` gradient rule don't feel familiar yet, start there; everything here leans on it. Following along with the [lecture](https://youtu.be/VMj-3S1tku0)? This is the second half.",
    },
    {
      kind: "quiz",
      prompt:
        "Before any code: training a network means repeatedly doing three things in a loop. What are they?",
      hint: "One computes the loss, one computes gradients, one changes the weights.",
      answer:
        "**Forward pass** (run the inputs through, compute the loss), **backward pass** (`loss.backward()` to get every gradient), and **update** (nudge each weight against its gradient). Repeat that loop and you have gradient descent.",
    },

    { kind: "heading", id: "a-neuron", text: "A neuron is barely an equation" },
    {
      kind: "paragraph",
      text: "A neuron takes some inputs, multiplies each by a *weight*, adds a *bias*, and squashes the result through a non-linearity like `tanh`. In code, the old neuron metaphor becomes `tanh(w · x + b)`. Because `w`, `x`, and `b` are all `Value` objects, this expression is automatically differentiable; the engine you built records the entire graph as it runs.",
    },
    {
      kind: "code",
      language: "python",
      caption: "A neuron: weighted sum of inputs, plus bias, through tanh.",
      code: `import random

class Neuron:
    def __init__(self, nin):
        self.w = [Value(random.uniform(-1, 1)) for _ in range(nin)]
        self.b = Value(random.uniform(-1, 1))

    def __call__(self, x):
        act = sum((wi*xi for wi, xi in zip(self.w, x)), self.b)  # w·x + b
        return act.tanh()

    def parameters(self):
        return self.w + [self.b]`,
    },
    {
      kind: "paragraph",
      text: "The `parameters()` method matters more than it looks: it's how you'll later reach in and grab every weight to update. PyTorch's modules have the exact same method, for the exact same reason.",
    },

    {
      kind: "heading",
      id: "layers-and-mlps",
      text: "Layers and MLPs are simple containers",
    },
    {
      kind: "paragraph",
      text: "A *layer* is a list of neurons evaluated independently on the same input. A *multi-layer perceptron* (MLP) is a list of layers, where each layer's output feeds the next. No new math, just composition. The diagram you have seen of dots connected to dots is this code.",
    },
    {
      kind: "code",
      language: "python",
      caption: "Layers stack into an MLP; parameters() flattens all the weights.",
      code: `class Layer:
    def __init__(self, nin, nout):
        self.neurons = [Neuron(nin) for _ in range(nout)]

    def __call__(self, x):
        outs = [n(x) for n in self.neurons]
        return outs[0] if len(outs) == 1 else outs

    def parameters(self):
        return [p for n in self.neurons for p in n.parameters()]

class MLP:
    def __init__(self, nin, nouts):
        sizes = [nin] + nouts
        self.layers = [Layer(sizes[i], sizes[i+1]) for i in range(len(nouts))]

    def __call__(self, x):
        for layer in self.layers:
            x = layer(x)
        return x

    def parameters(self):
        return [p for layer in self.layers for p in layer.parameters()]`,
    },
    {
      kind: "paragraph",
      text: "Now `n = MLP(3, [4, 4, 1])` is a real network: three inputs, two hidden layers of four neurons, one output. Call `n(x)` and you get a prediction, plus a computation graph stretching from that prediction all the way back to all 41 weights.",
    },
    {
      kind: "video",
      label: "Building Neuron, Layer, and MLP",
      timestamp: "103:53",
      seconds: 6233,
    },

    {
      kind: "heading",
      id: "loss",
      text: "Loss: one number for how wrong you are",
    },
    {
      kind: "paragraph",
      text: "To improve the network you need a single number that measures how badly it's doing right now: the *loss*. The simplest is mean-squared error: for each example, subtract the prediction from the target and square it (squaring discards the sign, so being wrong in either direction counts). Sum over all examples and you get one number that's `0` only when every prediction is perfect.",
    },
    {
      kind: "code",
      language: "python",
      caption: "A tiny dataset and the mean-squared-error loss.",
      code: `xs = [[2.0, 3.0, -1.0],
      [3.0, -1.0, 0.5],
      [0.5, 1.0, 1.0],
      [1.0, 1.0, -1.0]]
ys = [1.0, -1.0, -1.0, 1.0]          # desired targets

ypred = [n(x) for x in xs]
loss  = sum((yout - ygt)**2 for ygt, yout in zip(ys, ypred))`,
    },
    {
      kind: "quiz",
      prompt: "When exactly is this MSE loss equal to `0`?",
      hint: "Look at what gets squared.",
      answer:
        "Only when **every prediction equals its target**, so each `(yout - ygt)` is `0`. Any error in any direction squares to a positive number and pushes the loss up. Minimizing the loss *is* matching the targets.",
    },

    {
      kind: "heading",
      id: "gradient-descent",
      text: "Gradient descent: nudge every weight downhill",
    },
    {
      kind: "paragraph",
      text: "Now use the gradients. Call `loss.backward()` and your engine fills in `.grad` for all 41 weights. Each one says how the loss responds to that weight. The gradient points in the direction that *increases* the loss, and we want to *decrease* it, so we step the opposite way. That minus sign is the single easiest thing to get wrong:",
    },
    {
      kind: "code",
      language: "python",
      caption: "One optimization step. The minus sign is load-bearing.",
      code: `loss.backward()

for p in n.parameters():
    p.data += -0.05 * p.grad   # step AGAINST the gradient to lower the loss`,
    },
    {
      kind: "callout",
      tone: "note",
      title: "The learning rate is a real knob",
      text: "That `0.05` is the *learning rate*: how big a step you take. Too small and training crawls. Too big and you overshoot the minimum and the loss can blow up. There is no perfect value in advance; start small, watch the loss, and adjust.",
    },

    { kind: "heading", id: "training-loop", text: "The training loop" },
    {
      kind: "paragraph",
      text: "Wrap the three steps in a loop and you have training. Run it and watch the printed loss fall step by step. That number going down is your network learning.",
    },
    {
      kind: "code",
      language: "python",
      caption: "Forward, zero the grads, backward, update, repeat.",
      code: `for k in range(20):
    # forward
    ypred = [n(x) for x in xs]
    loss  = sum((yout - ygt)**2 for ygt, yout in zip(ys, ypred))

    # zero the gradients BEFORE backward (see warning below)
    for p in n.parameters():
        p.grad = 0.0

    # backward
    loss.backward()

    # update
    for p in n.parameters():
        p.data += -0.05 * p.grad

    print(k, loss.data)`,
    },
    {
      kind: "callout",
      tone: "warn",
      title: "Forgetting zero_grad, the most common bug in deep learning",
      text: "Remember that `backward()` *accumulates* into `.grad` with `+=`. If you don't reset every gradient to `0` before each backward pass, gradients from previous steps pile on top of the new ones and your updates stop meaning what you think they mean. Andrej makes this exact mistake on camera because it is that common. Zero the grads first, every iteration.",
    },
    {
      kind: "video",
      label: "The zero_grad bug, made on camera",
      timestamp: "130:05",
      seconds: 7805,
    },

    {
      kind: "heading",
      id: "what-is-a-neural-net",
      text: "So what is a neural net?",
    },
    {
      kind: "paragraph",
      text: "The full picture is smaller than it first seems. A neural net is a mathematical expression that takes data and weights, runs a forward pass to a prediction, and uses a loss function to score that prediction. You backpropagate the loss to get gradients, then take a small step downhill on every weight. Repeat that many times and the weights settle into values that do what you want.",
    },
    {
      kind: "paragraph",
      text: "Your network has 41 parameters. GPT-class models have hundreds of billions, plus a different loss (cross-entropy) and a stronger update rule (Adam, not plain SGD). But the skeleton is the same: forward, loss, backward, step. You now understand that loop at the level of individual scalars.",
    },

    { kind: "heading", id: "build-it", text: "Now build it" },
    {
      kind: "paragraph",
      text: "Open [the neural-net-training project](/projects/nn-zero-to-hero/neural-net-training) and build it on top of the engine you already wrote: `Neuron`, `Layer`, `MLP`, then the training loop. The tests check that the loss drops, so you can see whether your network is learning. If you have not built the engine yet, go back to [Build an autograd engine](/guides/build-an-autograd-engine) first.",
    },
  ],
};
