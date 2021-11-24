const { ethers, network } = require("hardhat");
const { expect } = require("chai");

const JXJOE_AGGREGATOR_ADDRESS = "0x02D35d3a8aC3e1626d3eE09A78Dd87286F5E8e3a";
const PRICEORACLE_OLD_ADRESS = "0xe34309613B061545d42c4160ec4d64240b114482";

const JXJOE_ADDRESS = "0xC146783a59807154F92084f9243eb139D58Da696";
const XJOE_ADDRESS = "0x57319d41f71e81f3c65f2a47ca4e001ebafd4f33";
const JOE_ADDRESS = "0x6e84a6216ea6dacc71ee8e6b0a5b7322eebc0fdd";

describe("PriceOracleProxyUSD", function () {
    before(async function () {
        // Accounts
        this.signers = await ethers.getSigners();
        this.alice = this.signers[0];

        // Contract Factory
        this.priceOracleCF = await ethers.getContractFactory("PriceOracleProxyUSD")
        this.JCollateralCapErc20Delegate = await ethers.getContractFactory("JCollateralCapErc20Delegate")
        this.JErc20 = await ethers.getContractFactory("JErc20")

        // Tokens
        this.joe = await this.JCollateralCapErc20Delegate.attach(JOE_ADDRESS)
        this.xJoe = await this.JCollateralCapErc20Delegate.attach(XJOE_ADDRESS)
        this.jXJoe = await this.JCollateralCapErc20Delegate.attach(JXJOE_ADDRESS)
        this.oracleOld = await this.priceOracleCF.attach(PRICEORACLE_OLD_ADRESS)
    });

    beforeEach(async function () {
        // We reset the state before each tests
        await network.provider.request({
            method: "hardhat_reset",
            params: [
                {
                    forking: {
                        jsonRpcUrl: "https://api.avax.network/ext/bc/C/rpc",
                        blockNumber: 7328000,
                    },
                    live: false,
                    saveDeployments: true,
                    tags: ["test", "local"],
                },
            ],
        });

        // Deploying contract
        this.oracle = await this.priceOracleCF.deploy(this.alice.address)
        await this.oracle.deployed()
    });

    describe("Test Oracle", function () {
        it("Verifies that xJoePrice is equal to JoePrice * ratio", async function () {
            await this.oracle._setAggregators([this.jXJoe.address], [JXJOE_AGGREGATOR_ADDRESS])
            // asks XJoe price using the new contract
            const xJoePrice = await this.oracle.getUnderlyingPrice(JXJOE_ADDRESS)

            // asks JoePrice using the old contract
            const joePrice = await this.oracleOld.getUnderlyingPrice(JXJOE_ADDRESS)

            // calculates joe:xjoe ratio
            const joeAmount = await this.joe.balanceOf(XJOE_ADDRESS);
            const xJoeAmount = await this.xJoe.totalSupply();
            const ratio = joeAmount.mul("1000000000000000000").div(xJoeAmount);

            // calculates the XJoe price
            const xJoePriceCalculated = joePrice.mul(ratio).div("1000000000000000000")

            // Verifies that the 2 prices are identical
            await expect(xJoePriceCalculated).to.equal(xJoePrice);
        });
    });

    after(async function () {
        await network.provider.request({
            method: "hardhat_reset",
            params: [],
        });
    });
});
