pragma solidity ^0.5.16;

contract MockPot {
    uint256 public dsr; // the Dai Savings Rate

    constructor(uint256 dsr_) public {
        setDsr(dsr_);
    }

    function setDsr(uint256 dsr_) public {
        dsr = dsr_;
    }
}

contract MockJug {
    struct Ilk {
        uint256 duty;
        uint256 rho;
    }

    mapping(bytes32 => Ilk) public ilks;
    uint256 public base;

    constructor(uint256 duty_, uint256 base_) public {
        setETHDuty(duty_);
        setBase(base_);
    }

    function setBase(uint256 base_) public {
        base = base_;
    }

    function setETHDuty(uint256 duty_) public {
        ilks["ETH-A"].duty = duty_;
    }
}
