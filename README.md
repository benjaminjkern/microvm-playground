# [MicroVM Playground (Click here to check it out)](https://benjaminjkern.github.io/microvm-playground)
An interactive playground that automatically evolves MicroVMs to play a simple 2 player game. The game chosen for this simulation is a simple fighting game.

In my opinion, this was a very successful experiment. I have run it overnight (10000+ generations) and ended up with bots that are very good at fighting. They learn to aim, stay on target, look ahead to where their target WILL be (as opposed to where they are currently) and in some cases, even dodge incoming attacks.

## Controls
- `E`: Switch graph mode (Elo scores, Kin-sorted color graph, Score-sorted color graph)
- `S`: Toggle between running simulation in "Sped up mode". Doesn't render anything and just tries to train the bots as fast as possible.
- `P`: Toggle pause simulation
- `M`: Toggle manual control mode

### Manual control mode
If you want, you can fight the bots yourself! If they are trained well (for long enough), they'll probably beat you though. Press `M` to toggle manual control mode.

To control your bot:
- `Up/Down`: Move your bot forward/backward
- `Left/Right`: Rotate your bot left/right
- `Space`: Fire a small bullet
- `Shift + Space`: Fire a big bullet

## What is a MicroVM?
It's the same as a normal VM, but it has a VERY limited amount of memory, and a sort of weird instructionset.
The bots have a set of inputs, a set of outputs (controls), and a limited amount of steps to make calculations per frame.
Every frame, the bots have all of their inputs written to, and they are allowed to step forward the set number of steps. Whatever is in their output buffer at the end of the instruction steps determines what their movement will be. They are allowed to keep all written memory and current instruction pointer between frames, but everything gets reset between rounds.

N microvms are created completely randomly at the beginning, and after M randomly selected rounds, the top N/2 bots (sorted by this round's elo score) get to move on AND reproduce. When they reproduce, they "mutate": every piece of starting memory gets randomly shifted, and each instruction has a random chance of changing to a new instruction.

### What is the instructionset?
For these microvms, all of the memory (input, output, internal) is all just a list of floating point numbers, and the instructionset is basically everything you can do with just floating point numbers. Specifically:
- `add/sub/mult/div/min/max`: Take in two numbers (located at specific addresses), calculate something on it, and set a specific memory address to that value.
- `neg/move` Take in one number, and set a specific memory address to the negative of that value, or in the case of move, just move the value there.
- `jump`: Jump to a different instruction pointer address.
- `jgz`: Read in a data value at an address, and jump to the specified instruction pointer address if the value read is greater than 0.
- `read/write`: Read from input and move it into memory / Write from a specific memory address to output.
