# Message pour le 3D artist (à envoyer tel quel)

Hi,

Thank you for the work so far. I'd like to insist on one point for the six frames you're working on now, and for the Cube, which is missing detail.

**The customer must be able to see exactly what they are going to buy, during the virtual try-on.** That means every fine detail of the frame has to be visible and readable on screen, even at the smallest size the frame appears on a face:

- **Engraved and printed text**: the brand name, the model name, the optical marking (e.g. 49-20-140), any logo on the temples or the front. It must be legible, not a blur. Please use a texture at 2048 px (or 4096 px for the front face) for these areas, and keep the lettering sharp, not baked into a tiny low-resolution map.
- **Fine details**: hinges and screws, rivets, the nose pads, the metal bars and inlays, the tips of the temples, the bevels and edges of the rims.
- **Colours and materials, true to the real product**: the exact colours (give me the reference, ideally a photo of the real frame), tortoise patterns, gradients, two-tone temples, matte vs. glossy, brushed vs. polished metal. Use proper PBR maps (base colour, roughness, metalness, normal map for relief).
- **Temples straight and open**, as on the real frame (no curved or bent temples in the preview image), with the end hooks modelled.

Technical reminders (same as the spec I sent):
- One `model.glb` (glTF 2.0, no Draco/Meshopt), under 5 MB, Y up, front toward +Z, temples toward −Z, origin at the bridge center, symmetric.
- Separate, named objects: `R_Lens`, `L_Lens` (no colour or texture on them, I render them clear), `Front`, `R_Temple`, `L_Temple`, `Pads`, `Hinges`.
- Real dimensions in mm for each frame: lens width, bridge, temple length, total front width, lens height (measured with calipers on the real frame).
- A 400 × 300 thumbnail, front view, neutral background.

Please also send close-up renders of the details (text, hinge, temple tip) so I can check them before integration.

Thank you very much!
