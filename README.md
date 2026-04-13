# NETIX — NFT Event Ticketing 🎫

Welcome to **NETIX**, a decentralized application (dApp) built for seamless and secure NFT-based event ticketing via the Ethereum ecosystem. With this platform, organizers can create events, and users can purchase entry tickets as NFTs. Additionally, users can resell these tickets on a built-in marketplace, with automated royalties routed instantly to the respective organizers.

---

## 🛠 Prerequisites
Before running the project locally, ensure you have the following installed:
1. **Node.js** (v18 or higher recommended)
2. **MetaMask** Browser Extension connected to the **Sepolia Test Network**
3. **Test ETH** on the Sepolia Network. You can get free Sepolia ETH at [Sepolia Faucet](https://sepoliafaucet.com/) or [Google Web3 Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia).

---

## 🚀 Getting Started

The project is split into two parts: the Hardhat Smart Contract environment and the Vite/Vanilla JS frontend user interface.

### Step 1: Install Smart Contract Dependencies
Open a terminal in the root project directory (`nft-ticketing`):
```bash
# Install hardhat and related dependencies
npm install

# Compile the smart contract
npx hardhat compile
```

### Step 2: Running the Frontend User Interface
The frontend is built using Vite and `ethers.js` logic and exists independently in the `frontend` folder.

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install frontend dependencies:
   ```bash
   npm install
   ```
3. Start the Vite local development server:
   ```bash
   npm run dev
   ```

### Step 3: Open the Platform
1. Look at your terminal output when you run `npm run dev` (it will typically be `http://localhost:3000` or `http://localhost:3001`).
2. Open that URL in your browser (e.g., Google Chrome where MetaMask is installed).
3. The platform will load securely over localhost.

---

## 🦊 How to Interact with the Website

1. **Connect Wallet:** Click the "Connect Wallet" button located on the top right.
2. **Switch Network:** MetaMask will prompt you to approve the connection. The application will automatically detect your network and attempt to switch your MetaMask connection to the **Sepolia Test Network** if you are on the Ethereum Mainnet or elsewhere.
3. **Create an Event:** On the "Events" tab, fill out the form specifying the event name, max ticket capacity, price (in ETH), and desired royalty percentage. Submitting this sends a transaction to the network.
4. **Purchase and View:** Tickets can be bought securely down below in the available event cards, and users can manage their purchased tickets within the "My Tickets" tab.
5. **Marketplace:** You can list owned tickets for resale, allowing other users in the "Marketplace" tab to buy them, automatically handling your set royalties per purchase!

> **Note:** Whenever you make a transaction (like creating an event or purchasing a ticket), MetaMask will open and prompt you to confirm the GAS fees (in Sepolia ETH) necessary to commit that operation onto the blockchain. Always wait for the "success" toast notification to know it has finalized.

---

## 📝 Smart Contract Deployment (Optional)

We currently deploy to Sepolia. If you'd like to deploy your version of the smart contract independently using your private key:
1. Ensure your `.env` contains your `RPC_URL` (Alchemy/Infura Sepolia endpoint) and `PRIVATE_KEY` (from MetaMask).
2. From the root directory, run:
   ```bash
   npx hardhat run scripts/deploy.js --network sepolia
   ```
3. Copy your specific deployed address. Navigate to `frontend/main.js` and paste it inside the `CONTRACT_ADDRESS` constant to sync it with your frontend.
