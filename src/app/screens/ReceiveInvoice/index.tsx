import {
  CaretLeftIcon,
  CheckIcon,
  CopyIcon,
} from "@bitcoin-design/bitcoin-icons-react/outline";
import Button from "@components/Button";
import Container from "@components/Container";
import Header from "@components/Header";
import IconButton from "@components/IconButton";
import Loading from "@components/Loading";
import DualCurrencyField from "@components/form/DualCurrencyField";
import TextField from "@components/form/TextField";
import { useEffect, useRef, useState } from "react";
import Confetti from "react-confetti";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import Avatar from "~/app/components/Avatar";
import QRCode from "~/app/components/QRCode";
import SkeletonLoader from "~/app/components/SkeletonLoader";
import toast from "~/app/components/Toast";
import { useAccount } from "~/app/context/AccountContext";
import { useSettings } from "~/app/context/SettingsContext";
import { isAlbyOAuthAccount } from "~/app/utils";
import api from "~/common/lib/api";
import msg from "~/common/lib/msg";
import { poll } from "~/common/utils/helpers";

function ReceiveInvoice() {
  const { t } = useTranslation("translation", { keyPrefix: "receive" });
  const { t: tCommon } = useTranslation("common");

  const auth = useAccount();
  const {
    isLoading: isLoadingSettings,
    settings,
    getFormattedFiat,
  } = useSettings();
  const showFiat = !isLoadingSettings && settings.showFiat;

  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    amount: "0",
    description: "",
    expiration: "",
  });
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [invoice, setInvoice] = useState<{
    paymentRequest: string;
    rHash: string;
  } | null>();
  const [copyInvoiceLabel, setCopyInvoiceLabel] = useState(
    tCommon("actions.copy_invoice") as string
  );

  const [paid, setPaid] = useState(false);
  const [pollingForPayment, setPollingForPayment] = useState(false);
  const mounted = useRef(false);
  const isAlbyOAuthUser = isAlbyOAuthAccount(auth.account?.connectorType);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  const [fiatAmount, setFiatAmount] = useState("");

  useEffect(() => {
    if (formData.amount !== "" && showFiat) {
      (async () => {
        const res = await getFormattedFiat(formData.amount);
        setFiatAmount(res);
      })();
    }
  }, [formData, showFiat, getFormattedFiat]);

  function handleChange(
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value.trim(),
    });
  }

  function checkPayment(paymentHash: string) {
    setPollingForPayment(true);
    poll({
      fn: () =>
        msg.request("checkPayment", { paymentHash }) as Promise<{
          paid: boolean;
        }>,
      validate: (payment) => payment.paid,
      interval: 3000,
      maxAttempts: 20,
      shouldStopPolling: () => !mounted.current,
    })
      .then(() => {
        setPaid(true);
        auth.fetchAccountInfo(); // Update balance.
      })
      .catch((err) => console.error(err))
      .finally(() => {
        setPollingForPayment(false);
      });
  }

  function setDefaults() {
    setFormData({
      amount: "0",
      description: "",
      expiration: "",
    });
    setPaid(false);
    setPollingForPayment(false);
    setInvoice(null);
  }

  async function createInvoice() {
    try {
      setLoadingInvoice(true);
      const response = await api.makeInvoice({
        amount: formData.amount,
        memo: formData.description,
      });
      setInvoice(response);
      checkPayment(response.rHash);
    } catch (e) {
      if (e instanceof Error) {
        toast.error(e.message);
      }
    } finally {
      setLoadingInvoice(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createInvoice();
  }

  function renderInvoice() {
    if (!invoice) return null;
    return (
      <>
        <div className="mt-4 relative p-8 bg-white dark:bg-surface-01dp rounded-lg shadow-sm ring-1 ring-black ring-opacity-5 flex justify-center items-center overflow-hidden">
          <div className="relative flex items-center justify-center">
            <QRCode value={invoice.paymentRequest.toUpperCase()} />
            {isAlbyOAuthUser ? (
              <>
                {!auth.accountLoading && auth.account ? (
                  <Avatar
                    size={64}
                    className="border-4 border-white rounded-full absolute inset-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 bg-white"
                    url={auth.account.avatarUrl}
                    name={auth.account.id}
                  />
                ) : (
                  auth.accountLoading && (
                    <SkeletonLoader
                      circle
                      opaque={false}
                      className="w-[64px] h-[64px] border-4 border-white rounded-full absolute inset-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 opacity-100"
                    />
                  )
                )}
              </>
            ) : (
              <img
                className="w-[64px] h-[64px] absolute z-10"
                src="assets/icons/alby_icon_qr.svg"
                alt="Alby logo"
              />
            )}
          </div>
          {paid && (
            <div className="absolute inset-0 flex justify-center items-center bg-white/90">
              <div className="text-center">
                <div className="inline-block bg-green-bitcoin p-1 rounded-full mb-2">
                  <CheckIcon className="w-7 h-7 text-white" />
                </div>
                <p className="text-lg font-bold">{t("success")}</p>
              </div>
            </div>
          )}
        </div>
        {paid && (
          <div className="mt-4">
            <Button
              type="submit"
              label={tCommon("actions.receive_again")}
              primary
              fullWidth
              onClick={() => {
                setDefaults();
                navigate("/receive/invoice");
              }}
            />
          </div>
        )}
        {!paid && (
          <>
            <div className="mt-8 mb-4 flex justify-center">
              <Button
                onClick={async () => {
                  try {
                    navigator.clipboard.writeText(invoice.paymentRequest);
                    setCopyInvoiceLabel(tCommon("copied"));
                    setTimeout(() => {
                      setCopyInvoiceLabel(tCommon("actions.copy_invoice"));
                    }, 1000);
                  } catch (e) {
                    if (e instanceof Error) {
                      toast.error(e.message);
                    }
                  }
                }}
                icon={<CopyIcon className="w-6 h-6 mr-2" />}
                label={copyInvoiceLabel}
                primary
              />
            </div>

            <div className="flex justify-center">
              {pollingForPayment && (
                <div className="flex items-center space-x-2 dark:text-white">
                  <Loading />
                  <span>{t("payment.waiting")}</span>
                </div>
              )}

              {!pollingForPayment && (
                <Button
                  onClick={() => checkPayment(invoice.rHash)}
                  label={t("payment.status")}
                />
              )}
            </div>
          </>
        )}
        {paid && (
          <Confetti
            width={window.innerWidth}
            height={window.innerHeight}
            recycle={false}
            onConfettiComplete={(confetti) => {
              confetti && confetti.reset();
            }}
            style={{ pointerEvents: "none" }}
          />
        )}
      </>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto no-scrollbar">
      <Header
        headerLeft={
          <IconButton
            onClick={() => {
              invoice ? setDefaults() : navigate(-1);
            }}
            icon={<CaretLeftIcon className="w-4 h-4" />}
          />
        }
      >
        {t("title")}
      </Header>
      {invoice ? (
        <Container maxWidth="sm">{renderInvoice()}</Container>
      ) : (
        <div className="pt-4 h-full">
          <form onSubmit={handleSubmit} className="h-full">
            <fieldset disabled={loadingInvoice} className="h-full">
              <Container justifyBetween maxWidth="sm">
                <div>
                  <div className="mb-4">
                    <DualCurrencyField
                      id="amount"
                      min={0}
                      label={t("amount.label")}
                      placeholder={t("amount.placeholder")}
                      fiatValue={fiatAmount}
                      onChange={handleChange}
                      autoFocus
                    />
                  </div>

                  <div className="mb-4">
                    <TextField
                      id="description"
                      label={t("description.label")}
                      placeholder={t("description.placeholder")}
                      onChange={handleChange}
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  label={t("actions.create_invoice")}
                  fullWidth
                  primary
                  loading={loadingInvoice}
                  disabled={loadingInvoice}
                />
              </Container>
            </fieldset>
          </form>
        </div>
      )}
    </div>
  );
}

export default ReceiveInvoice;
