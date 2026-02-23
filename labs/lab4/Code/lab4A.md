# ASR Testing & Confidence Reflection

## 1. What I Tested & Short Reflection

I tested a mix of fictional names, scientific names, personal names (which was mine), and historic names to see how the ASR transcribes them and what confidence it reports. I inspected `context.lastResult` in the browser console and recorded the utterance and confidence values.  

| Intended / Actual Name | Recognized As | Confidence | Notes |
|------------------------|---------------|-----------|-------|
| Tatooine | Tatooine | ![0.8356](https://img.shields.io/badge/0.8356-Good-brightgreen) | High confidence, correct. |
| Rivendell | Rivendell | ![0.1586](https://img.shields.io/badge/0.1586-Low-red) | Very low confidence; misrecognized often. |
| Darth Vader | Darth Vader | ![0.8836](https://img.shields.io/badge/0.8836-Good-brightgreen) | High confidence, correct. |
| Ashoka | Ashoka | ![0.7646](https://img.shields.io/badge/0.7646-Good-brightgreen) | Good recognition. |
| Kenobi | Kenobi | ![0.5131](https://img.shields.io/badge/0.5131-Moderate-yellow) | Moderate confidence. |
| Lightsaber | Lightsaber | ![0.3106→0.5812](https://img.shields.io/badge/0.3106-0.5812-Low-red) | Low at first, improved after retry. |
| Homo sapiens | Homo sapiens | ![0.8747](https://img.shields.io/badge/0.8747-Good-brightgreen) | High confidence for scientific name. |
| Panthera leo | Pantera, Leo | ![0.3435](https://img.shields.io/badge/0.3435-Low-red) | Misrecognized; low confidence. |
| Adib Wahid | Adib Wahid | ![0.1745](https://img.shields.io/badge/0.1745-Low-red) | Low confidence for my personal name. |
| Bin Quader (intended) | Binkader | ![0.0510](https://img.shields.io/badge/0.0510-Low-red) | Very low — heavily misheard. |
| Khalid bin Walid | Khalid bin Walid | ![0.3536](https://img.shields.io/badge/0.3536-Low-red) | Low confidence. |
| Sultan Mehmet | Sultan Mehmet | ![0.4566](https://img.shields.io/badge/0.4566-Moderate-yellow) | Partial recognition; vowel misheard. |
| Rabindranath Tagore | Rabindranath Tagore | ![0.6024](https://img.shields.io/badge/0.6024-Moderate-yellow) | Good recognition. |
| Kazi Nazrul Islam (intended) | Kajinos rule is slow | ![0.1337](https://img.shields.io/badge/0.1337-Low-red) | Very poor — ASR scrambled the name. |
| Franz Kafka | Franz Kafka | ![0.3416](https://img.shields.io/badge/0.3416-Low-red) | Low confidence. |

> **Badge colors legend:**  
> 🟢 `Good` → confidence ≥ 0.7  
> 🟡 `Moderate` → 0.5 ≤ confidence < 0.7  
> 🔴 `Low` → confidence < 0.5  

---

## 2. Sample Code: Logging & Announcing Confidence

I logged confidence to the console and added a TTS announcement that reports whether the confidence is **“good”** or **“low.”**

### Console Logging

```ts
dmActor.subscribe((state) => {
  const lastResult = state.context.lastResult;

  if (lastResult && lastResult[0]) {
    console.log(
      "Recognized utterance:",
      lastResult[0].utterance,
      "| Confidence:",
      lastResult[0].confidence
    );
  }
});
```

### Announcing Confidence to the User (State Entry)

```ts
entry: ({ context }) => {
  const confidence = context.lastResult![0].confidence;

  const utterance =
    confidence < 0.5
      ? `The confidence score is ${confidence.toFixed(4)}, which is low.`
      : `The confidence score is ${confidence.toFixed(4)}, which is good.`;

  context.spstRef.send({
    type: "SPEAK",
    value: { utterance },
  });
};
```

## 3. How Good Are These Scores & Why Recognition Falters

### Score Interpretation

- Scores ≥ ~0.7 → reliably correct (e.g., *Darth Vader*, *Homo sapiens*).  
- Scores < 0.5 → usually misrecognitions or very uncertain results (e.g., *Kajinos* for *Kazi Nazrul Islam*, *Binkader* for *Bin Quader*).  

### Why Recognition Falters

- Out-of-vocabulary (OOV) words and uncommon names are underrepresented in ASR training data.  
- Multi-word terms and foreign spellings, for examples: binomial species names, non-English names(my own name and a few bengali authors names) increases complexity.  
- Pronunciation or accent differences, probably a bit of south asian accent in me is causing that.  

---

## 4. Possible Solutions (Practical Fixes)

- Use **confidence thresholds**:
  - Accept if ≥ 0.7  
  - Confirm if 0.5–0.7  
  - Re-prompt if < 0.5  
- Implement **custom speech adaptation or pronunciation lexicons** (if supported by the ASR provider).  
- Ask the user to **confirm low-confidence recognitions** before proceeding. This way unknown names like mine and different accent can be dealt.  
- Allow a **retry strategy**, as repeated attempts can sometimes improve confidence (e.g., *Lightsaber*).  

---

## Conclusion
From here we can say that:
- High scores usually indicate correct transcription.  
- Low scores reliably flag risky or uncertain inputs.  

The ASR handled many common names well but struggled with:

- Less common personal names  
- Multi-word scientific names  
- Regional or foreign names, especially with pronunciation differences  