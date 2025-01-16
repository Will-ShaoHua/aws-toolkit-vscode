from llama_cpp import Llama
from flask import Flask, request, jsonify
import time

app = Flask(__name__)

llm = Llama.from_pretrained(
    repo_id="bartowski/Qwen2.5-Coder-0.5B-GGUF",
    filename="Qwen2.5-Coder-0.5B-Q6_K.gguf",
)


def complete_code(prompt, max_tokens=50):
    """
    Perform single-line code completion using the GGUF model.
    Stops at the first newline character.
    """
    # Generate text
    response = llm(
        prompt=prompt,
        max_tokens=max_tokens,
        # stop=["\n"],  # Stop generation at the first newline
        temperature=0.7,  # Adjust for creativity
        top_p=0.9  # Use nucleus sampling
    )
    # Extract and return the completion
    return response["choices"]


@app.route('/complete', methods=['POST'])
def get_completion():
    try:
        # Get the prompt from the request JSON
        data = request.get_json()
        if not data or 'prompt' not in data:
            return jsonify({'error': 'No prompt provided'}), 400
        
        prompt = data['prompt']
        max_tokens = data.get('max_tokens', 50)  # Optional parameter with default value
        
        # Get the start time
        start_time = time.time()
        
        # Get the completion
        completion = complete_code(prompt, max_tokens)
        
        # Calculate processing time
        processing_time = time.time() - start_time
        
        # Return the result
        return jsonify({
            'completion': completion,
            'processing_time': processing_time
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)

