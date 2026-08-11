import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { streamingState } from '~/lib/stores/streaming';
import { DeployHub } from '~/components/deploy/DeployHub';

export const DeployButton = () => {
  const [showHub, setShowHub] = useState(false);
  const isStreaming = useStore(streamingState);

  return (
    <>
      <button
        onClick={() => setShowHub(true)}
        disabled={isStreaming}
        className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
      >
        <span>🚀</span>
        <span>Deploy</span>
      </button>

      {showHub && <DeployHub onClose={() => setShowHub(false)} />}
    </>
  );
};